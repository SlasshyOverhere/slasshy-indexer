use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbMetadata {
    pub title: String,
    pub year: Option<i32>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub tmdb_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TmdbSearchResult {
    results: Vec<TmdbItem>,
    total_results: Option<i32>,
}

#[derive(Debug, Deserialize, Clone)]
struct TmdbItem {
    id: i64,
    #[serde(alias = "name")]
    title: Option<String>,
    #[serde(alias = "original_name")]
    original_title: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    #[serde(alias = "first_air_date")]
    release_date: Option<String>,
    vote_average: Option<f64>,
    popularity: Option<f64>,
    vote_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct TmdbFindResult {
    movie_results: Vec<TmdbItem>,
    tv_results: Vec<TmdbItem>,
}

/// Build HTTP client with proper timeout
fn build_client() -> Result<reqwest::blocking::Client, Box<dyn std::error::Error + Send + Sync>> {
    Ok(reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("SlashyMediaIndexer/1.0")
        .build()?)
}

/// Check if the given credential is an access token (starts with "eyJ") or API key
fn is_access_token(credential: &str) -> bool {
    credential.starts_with("eyJ")
}

/// Build the URL with proper authentication
/// - For API keys: adds ?api_key=XXX to URL
/// - For access tokens: returns URL without api_key (auth goes in header)
fn build_tmdb_url(base_path: &str, credential: &str, extra_params: &str) -> String {
    if is_access_token(credential) {
        format!(
            "https://api.themoviedb.org/3{}?{}",
            base_path,
            extra_params
        )
    } else {
        format!(
            "https://api.themoviedb.org/3{}?api_key={}&{}",
            base_path, credential, extra_params
        )
    }
}

/// Execute a TMDB request with proper authentication
fn tmdb_request(client: &reqwest::blocking::Client, url: &str, credential: &str) -> Result<reqwest::blocking::Response, reqwest::Error> {
    if is_access_token(credential) {
        client.get(url)
            .header("Authorization", format!("Bearer {}", credential))
            .send()
    } else {
        client.get(url).send()
    }
}

/// Normalize a title for comparison (remove punctuation, lowercase, etc.)
fn normalize_title(title: &str) -> String {
    let mut normalized = title.to_lowercase();

    // Replace common variations
    normalized = normalized.replace('&', "and");
    normalized = normalized.replace("'", "");
    normalized = normalized.replace("'", "");
    normalized = normalized.replace(":", "");
    normalized = normalized.replace("-", " ");
    normalized = normalized.replace("_", " ");
    normalized = normalized.replace(".", " ");

    // Remove articles for comparison
    let articles = ["the ", "a ", "an "];
    for article in articles.iter() {
        if normalized.starts_with(article) {
            normalized = normalized[article.len()..].to_string();
        }
    }

    // Remove all non-alphanumeric except spaces
    normalized = normalized.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();

    // Collapse multiple spaces
    normalized.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Calculate similarity score between two titles (0.0 - 1.0)
fn title_similarity(a: &str, b: &str) -> f64 {
    let norm_a = normalize_title(a);
    let norm_b = normalize_title(b);

    if norm_a == norm_b {
        return 1.0;
    }

    if norm_a.is_empty() || norm_b.is_empty() {
        return 0.0;
    }

    // Check if one contains the other
    if norm_a.contains(&norm_b) || norm_b.contains(&norm_a) {
        let len_ratio = (norm_a.len().min(norm_b.len()) as f64) / (norm_a.len().max(norm_b.len()) as f64);
        return 0.7 + (len_ratio * 0.3);
    }

    // Calculate word overlap (Jaccard-like similarity)
    let words_a: std::collections::HashSet<&str> = norm_a.split_whitespace().collect();
    let words_b: std::collections::HashSet<&str> = norm_b.split_whitespace().collect();

    let intersection = words_a.intersection(&words_b).count() as f64;
    let union = words_a.union(&words_b).count() as f64;

    if union == 0.0 {
        return 0.0;
    }

    intersection / union
}

/// Clean title minimally - only remove obvious noise but keep the core title intact
fn minimal_clean_title(title: &str) -> String {
    let mut cleaned = title.to_string();
    
    // Only remove brackets and their contents at the END of the title
    if let Ok(re) = regex::Regex::new(r"\s*[\[\(][^\]\)]*[\]\)]\s*$") {
        cleaned = re.replace_all(&cleaned, "").to_string();
    }
    
    // Remove trailing dashes and what follows (often release group)
    if let Ok(re) = regex::Regex::new(r"\s+-\s*[A-Za-z0-9]+\s*$") {
        cleaned = re.replace_all(&cleaned, "").to_string();
    }
    
    cleaned.trim().to_string()
}

/// Extract potential alternative titles from a string
fn extract_title_variations(title: &str) -> Vec<String> {
    let mut variations = Vec::new();
    
    // 1. Original title as-is
    variations.push(title.to_string());
    
    // 2. Minimally cleaned
    let minimal = minimal_clean_title(title);
    if !minimal.is_empty() && minimal != title {
        variations.push(minimal.clone());
    }
    
    // 3. With spaces instead of dots/underscores
    let spaced = title.replace('.', " ").replace('_', " ");
    let spaced = spaced.split_whitespace().collect::<Vec<_>>().join(" ");
    if !spaced.is_empty() && !variations.contains(&spaced) {
        variations.push(spaced.clone());
    }
    
    // 4. Extract title from common patterns like "Title S01E01" or "Title.2019"
    // This helps with TV show episodes
    let patterns = [
        r"^(.+?)\s*[Ss]\d+[Ee]\d+",  // Title S01E01
        r"^(.+?)\s*\d{1,2}x\d{1,2}", // Title 1x01
        r"^(.+?)\s*[\.\s](?:19|20)\d{2}", // Title.2019 or Title 2019
    ];
    
    for pattern in &patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            if let Some(caps) = re.captures(&spaced) {
                if let Some(m) = caps.get(1) {
                    let extracted = m.as_str().trim().to_string();
                    if !extracted.is_empty() && extracted.len() >= 2 && !variations.contains(&extracted) {
                        variations.push(extracted);
                    }
                }
            }
        }
    }
    
    // 5. Remove "The" prefix for alternative search
    for v in variations.clone() {
        if let Ok(re) = regex::Regex::new(r"(?i)^the\s+(.+)") {
            if let Some(caps) = re.captures(&v) {
                if let Some(m) = caps.get(1) {
                    let without_the = m.as_str().to_string();
                    if !without_the.is_empty() && !variations.contains(&without_the) {
                        variations.push(without_the);
                    }
                }
            }
        }
    }
    
    // 6. Handle & vs and
    for v in variations.clone() {
        if v.contains('&') {
            let alt = v.replace('&', "and");
            if !variations.contains(&alt) {
                variations.push(alt);
            }
        }
        if v.to_lowercase().contains(" and ") {
            let alt = v.replace(" and ", " & ").replace(" And ", " & ").replace(" AND ", " & ");
            if !variations.contains(&alt) {
                variations.push(alt);
            }
        }
    }
    
    // Deduplicate while preserving order
    let mut seen = std::collections::HashSet::new();
    variations.retain(|v| {
        let lower = v.to_lowercase().trim().to_string();
        if seen.contains(&lower) || v.trim().is_empty() || v.len() < 2 {
            false
        } else {
            seen.insert(lower);
            true
        }
    });
    
    variations
}

/// Main search function - tries multiple strategies to find metadata
pub fn search_metadata(
    api_key: &str,
    title: &str,
    media_type: &str,
    year: Option<i32>,
    image_cache_dir: &str,
) -> Result<Option<TmdbMetadata>, Box<dyn std::error::Error + Send + Sync>> {
    println!("\n[TMDB] ========================================");
    println!("[TMDB] Searching for: '{}' (type: {}, year: {:?})", title, media_type, year);
    
    let variations = extract_title_variations(title);
    println!("[TMDB] Title variations: {:?}", variations);
    
    // Strategy 1: Search with specified media type and year
    if let Some(y) = year {
        println!("[TMDB] Strategy 1: {} search with year {}", media_type, y);
        for variation in &variations {
            if let Ok(Some(result)) = do_search(api_key, variation, media_type, Some(y), image_cache_dir, true) {
                return Ok(Some(result));
            }
        }
    }
    
    // Strategy 2: Search with specified media type, no year constraint
    println!("[TMDB] Strategy 2: {} search without year", media_type);
    for variation in &variations {
        if let Ok(Some(result)) = do_search(api_key, variation, media_type, None, image_cache_dir, true) {
            return Ok(Some(result));
        }
    }
    
    // Strategy 3: Try the OTHER media type (if searching for TV, try movie and vice versa)
    let alt_type = if media_type == "movie" { "tv" } else { "movie" };
    println!("[TMDB] Strategy 3: {} search (alternative type)", alt_type);
    for variation in &variations {
        if let Ok(Some(result)) = do_search(api_key, variation, alt_type, year, image_cache_dir, true) {
            return Ok(Some(result));
        }
    }
    
    // Strategy 4: Multi-search (searches across all media types)
    println!("[TMDB] Strategy 4: Multi-search");
    for variation in &variations {
        if let Ok(Some(result)) = do_multi_search(api_key, variation, media_type, image_cache_dir) {
            return Ok(Some(result));
        }
    }
    
    // Strategy 5: Try with just the first word (for short/numeric titles like "1899")
    if variations.iter().any(|v| v.split_whitespace().count() > 1) {
        println!("[TMDB] Strategy 5: First significant word search");
        for variation in &variations {
            let words: Vec<&str> = variation.split_whitespace().collect();
            if words.len() > 1 {
                // Try first word only
                let first = words[0];
                if first.len() >= 3 || first.chars().all(|c| c.is_ascii_digit()) {
                    // For numeric titles like "1899"
                    if let Ok(Some(result)) = do_search(api_key, first, media_type, None, image_cache_dir, false) {
                        // Verify it's a reasonable match
                        if is_reasonable_match(first, &result.title) {
                            return Ok(Some(result));
                        }
                    }
                    if let Ok(Some(result)) = do_search(api_key, first, alt_type, None, image_cache_dir, false) {
                        if is_reasonable_match(first, &result.title) {
                            return Ok(Some(result));
                        }
                    }
                }
            }
        }
    }
    
    // Strategy 6: Relaxed search - accept results with lower score
    println!("[TMDB] Strategy 6: Relaxed search (lower threshold)");
    for variation in &variations {
        if let Ok(Some(result)) = do_search(api_key, variation, media_type, None, image_cache_dir, false) {
            return Ok(Some(result));
        }
    }
    
    println!("[TMDB] All strategies exhausted, no results found for '{}'", title);
    println!("[TMDB] ========================================\n");
    Ok(None)
}

/// Check if a search result title is a reasonable match for the query
fn is_reasonable_match(query: &str, result_title: &str) -> bool {
    let q = query.to_lowercase();
    let r = result_title.to_lowercase();
    
    // Exact match
    if q == r {
        return true;
    }
    
    // Result contains query or query contains result
    if r.contains(&q) || q.contains(&r) {
        return true;
    }
    
    // For numeric titles, the result should start with or contain the number
    if query.chars().all(|c| c.is_ascii_digit()) {
        return r.contains(&q);
    }
    
    // First word matches
    let q_first = q.split_whitespace().next().unwrap_or("");
    let r_first = r.split_whitespace().next().unwrap_or("");
    if !q_first.is_empty() && q_first == r_first {
        return true;
    }
    
    false
}

/// Perform a single TMDB search
fn do_search(
    api_key: &str,
    title: &str,
    media_type: &str,
    year: Option<i32>,
    image_cache_dir: &str,
    strict: bool,
) -> Result<Option<TmdbMetadata>, Box<dyn std::error::Error + Send + Sync>> {
    let encoded_title = percent_encoding::utf8_percent_encode(
        title,
        percent_encoding::NON_ALPHANUMERIC,
    ).to_string();

    let mut params = format!("query={}&include_adult=false&language=en-US", encoded_title);

    if let Some(y) = year {
        if media_type == "movie" {
            params.push_str(&format!("&primary_release_year={}", y));
        } else {
            params.push_str(&format!("&first_air_date_year={}", y));
        }
    }

    let url = build_tmdb_url(&format!("/search/{}", media_type), api_key, &params);

    println!("[TMDB]   -> Trying '{}' as {} (year: {:?})", title, media_type, year);

    let client = build_client()?;
    let response = tmdb_request(&client, &url, api_key)?;

    if !response.status().is_success() {
        println!("[TMDB]   -> Request failed: {}", response.status());
        return Ok(None);
    }

    let result: TmdbSearchResult = response.json()?;
    let total = result.total_results.unwrap_or(0);
    println!("[TMDB]   -> Found {} results", total);

    if result.results.is_empty() {
        return Ok(None);
    }

    // Find the best match
    let best = find_best_match(&result.results, title, year, strict);

    if let Some(item) = best {
        if item.poster_path.is_some() || item.backdrop_path.is_some() || !strict {
            return create_metadata_from_item(&item, image_cache_dir);
        }
        println!("[TMDB]   -> Best match has no images, skipping in strict mode");
    }

    Ok(None)
}

/// Multi-search across all media types
fn do_multi_search(
    api_key: &str,
    title: &str,
    preferred_type: &str,
    image_cache_dir: &str,
) -> Result<Option<TmdbMetadata>, Box<dyn std::error::Error + Send + Sync>> {
    let encoded_title = percent_encoding::utf8_percent_encode(
        title,
        percent_encoding::NON_ALPHANUMERIC,
    ).to_string();

    let params = format!("query={}&include_adult=false&language=en-US", encoded_title);
    let url = build_tmdb_url("/search/multi", api_key, &params);

    println!("[TMDB]   -> Multi-search for '{}'", title);

    let client = build_client()?;
    let response = tmdb_request(&client, &url, api_key)?;
    
    if !response.status().is_success() {
        return Ok(None);
    }
    
    #[derive(Debug, Deserialize)]
    struct MultiSearchResult {
        results: Vec<MultiSearchItem>,
    }
    
    #[derive(Debug, Deserialize)]
    struct MultiSearchItem {
        id: i64,
        media_type: Option<String>,
        #[serde(alias = "name")]
        title: Option<String>,
        #[serde(alias = "original_name")]
        original_title: Option<String>,
        overview: Option<String>,
        poster_path: Option<String>,
        backdrop_path: Option<String>,
        #[serde(alias = "first_air_date")]
        release_date: Option<String>,
        vote_average: Option<f64>,
        popularity: Option<f64>,
        vote_count: Option<i64>,
    }
    
    let result: MultiSearchResult = response.json()?;
    println!("[TMDB]   -> Found {} multi-search results", result.results.len());
    
    let preferred = if preferred_type == "movie" { "movie" } else { "tv" };
    
    // Score and sort results
    let mut scored: Vec<(&MultiSearchItem, f64)> = result.results.iter()
        .filter(|item| {
            let mt = item.media_type.as_deref().unwrap_or("");
            mt == "movie" || mt == "tv"
        })
        .map(|item| {
            let item_type = item.media_type.as_deref().unwrap_or("");
            let has_poster = item.poster_path.is_some() || item.backdrop_path.is_some();
            let popularity = item.popularity.unwrap_or(0.0);
            let vote_count = item.vote_count.unwrap_or(0) as f64;
            
            let mut score = popularity * 0.3 + vote_count * 0.1;
            if item_type == preferred { score += 500.0; }
            if has_poster { score += 1000.0; }
            
            // Title match bonus
            let item_title = item.title.as_deref().unwrap_or("").to_lowercase();
            let search_lower = title.to_lowercase();
            if item_title == search_lower {
                score += 2000.0;
            } else if item_title.contains(&search_lower) || search_lower.contains(&item_title) {
                score += 500.0;
            }
            
            (item, score)
        })
        .collect();
    
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    
    if let Some((item, score)) = scored.first() {
        println!("[TMDB]   -> Best multi-search result: '{}' (score: {:.1})", 
                 item.title.as_deref().unwrap_or("?"), score);
        
        let tmdb_item = TmdbItem {
            id: item.id,
            title: item.title.clone(),
            original_title: item.original_title.clone(),
            overview: item.overview.clone(),
            poster_path: item.poster_path.clone(),
            backdrop_path: item.backdrop_path.clone(),
            release_date: item.release_date.clone(),
            vote_average: item.vote_average,
            popularity: item.popularity,
            vote_count: item.vote_count,
        };
        return create_metadata_from_item(&tmdb_item, image_cache_dir);
    }
    
    Ok(None)
}

/// Find the best match from search results using improved scoring
fn find_best_match<'a>(results: &'a [TmdbItem], search_title: &str, search_year: Option<i32>, strict: bool) -> Option<&'a TmdbItem> {
    if results.is_empty() {
        return None;
    }

    // Score each result
    let mut scored: Vec<(&TmdbItem, f64)> = results.iter()
        .map(|item| {
            let item_title = item.title.as_deref().unwrap_or("");
            let original_title = item.original_title.as_deref().unwrap_or("");
            let has_poster = item.poster_path.is_some();
            let has_backdrop = item.backdrop_path.is_some();
            let popularity = item.popularity.unwrap_or(0.0);
            let vote_avg = item.vote_average.unwrap_or(0.0);
            let vote_count = item.vote_count.unwrap_or(0) as f64;

            let mut score = 0.0;

            // Base popularity/quality score (capped to prevent dominance)
            score += (popularity.min(100.0)) * 0.5;
            score += vote_avg * 10.0;
            score += (vote_count.min(10000.0)) * 0.01;

            // Image availability - important for user experience
            if has_poster {
                score += 500.0;
            }
            if has_backdrop {
                score += 100.0;
            }

            // Title similarity - THE MOST IMPORTANT FACTOR
            let title_sim = title_similarity(search_title, item_title);
            let orig_title_sim = title_similarity(search_title, original_title);
            let best_sim = title_sim.max(orig_title_sim);

            // Heavy weight on title matching
            if best_sim >= 0.95 {
                score += 3000.0;  // Near-exact match
            } else if best_sim >= 0.8 {
                score += 2000.0 + (best_sim * 500.0);  // Very good match
            } else if best_sim >= 0.5 {
                score += 1000.0 + (best_sim * 500.0);  // Decent match
            } else if best_sim >= 0.3 {
                score += best_sim * 500.0;  // Partial match
            } else {
                score -= 500.0;  // Poor match penalty
            }

            // Year matching (with tolerance)
            if let Some(search_y) = search_year {
                let item_year = item.release_date.as_ref()
                    .and_then(|d| d.split('-').next())
                    .and_then(|y| y.parse::<i32>().ok());

                if let Some(item_y) = item_year {
                    let year_diff = (search_y - item_y).abs();
                    if year_diff == 0 {
                        score += 1000.0;  // Exact year match
                    } else if year_diff == 1 {
                        score += 500.0;   // Off by one year (common for releases)
                    } else if year_diff <= 2 {
                        score += 200.0;   // Close enough
                    } else if year_diff > 5 {
                        score -= 300.0;   // Likely wrong
                    }
                }
            }

            // Penalize very short titles that don't match well
            if item_title.len() < 3 && best_sim < 0.9 {
                score -= 300.0;
            }

            (item, score)
        })
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // In strict mode, require a minimum similarity score
    if strict {
        if let Some((item, score)) = scored.first() {
            let item_title = item.title.as_deref().unwrap_or("");
            let best_sim = title_similarity(search_title, item_title);
            if best_sim < 0.3 && *score < 1000.0 {
                println!("[TMDB]   -> Best match '{}' rejected (similarity: {:.2}, score: {:.1})",
                         item_title, best_sim, score);
                return None;
            }
        }
    }

    scored.first().map(|(item, _)| *item)
}

/// Create metadata from a TMDB item
fn create_metadata_from_item(
    item: &TmdbItem,
    image_cache_dir: &str,
) -> Result<Option<TmdbMetadata>, Box<dyn std::error::Error + Send + Sync>> {
    let found_title = item.title.clone()
        .or_else(|| item.original_title.clone())
        .unwrap_or_default();
    
    let found_year = item.release_date.as_ref()
        .and_then(|d| d.split('-').next())
        .and_then(|y| y.parse().ok());
    
    println!("[TMDB]   -> Match: '{}' ({:?})", found_title, found_year);
    
    // Try to get poster first, then backdrop
    let poster_path = if let Some(ref poster) = item.poster_path {
        println!("[TMDB]   -> Has poster: {}", poster);
        cache_image_with_fallback(poster, image_cache_dir)
    } else if let Some(ref backdrop) = item.backdrop_path {
        println!("[TMDB]   -> No poster, using backdrop: {}", backdrop);
        cache_image_with_fallback(backdrop, image_cache_dir)
    } else {
        println!("[TMDB]   -> No poster or backdrop available");
        None
    };
    
    Ok(Some(TmdbMetadata {
        title: found_title,
        year: found_year,
        overview: item.overview.clone(),
        poster_path,
        tmdb_id: Some(item.id.to_string()),
    }))
}

/// Cache image with multiple size fallbacks
fn cache_image_with_fallback(image_path: &str, cache_dir: &str) -> Option<String> {
    // Try different sizes in order of preference
    let sizes = ["w500", "w342", "w185", "original"];
    
    for size in &sizes {
        match cache_image(image_path, cache_dir, size) {
            Ok(path) => {
                println!("[TMDB]   -> Cached with size {}: {}", size, path);
                return Some(path);
            }
            Err(e) => {
                println!("[TMDB]   -> Failed with size {}: {}", size, e);
            }
        }
    }
    
    None
}

pub fn fetch_metadata_by_id(
    api_key: &str,
    id_or_url: &str,
    media_type: &str,
    image_cache_dir: &str,
) -> Result<TmdbMetadata, Box<dyn std::error::Error + Send + Sync>> {
    let (tmdb_id, source) = extract_id_from_input(id_or_url);

    println!("[TMDB] Fetching by ID: {} (source: {})", tmdb_id, source);

    let client = build_client()?;

    let final_id = if source == "imdb" {
        // Look up TMDB ID from IMDB ID
        let find_url = build_tmdb_url(
            &format!("/find/{}", tmdb_id),
            api_key,
            "external_source=imdb_id"
        );

        let response = tmdb_request(&client, &find_url, api_key)?;
        let result: TmdbFindResult = response.json()?;

        // Try movie results first, then TV
        let id = result.movie_results.first()
            .or_else(|| result.tv_results.first())
            .map(|r| r.id.to_string())
            .ok_or_else(|| format!("No match found for IMDB ID {}", tmdb_id))?;

        id
    } else {
        tmdb_id.to_string()
    };

    // Fetch details
    let url = build_tmdb_url(
        &format!("/{}/{}", media_type, final_id),
        api_key,
        "language=en-US"
    );

    let response = tmdb_request(&client, &url, api_key)?;

    if !response.status().is_success() {
        // Try the other media type
        let alt_type = if media_type == "movie" { "tv" } else { "movie" };
        let alt_url = build_tmdb_url(
            &format!("/{}/{}", alt_type, final_id),
            api_key,
            "language=en-US"
        );
        let alt_response = tmdb_request(&client, &alt_url, api_key)?;
        if !alt_response.status().is_success() {
            return Err(format!("Failed to fetch metadata for ID {}", final_id).into());
        }
        let item: TmdbItem = alt_response.json()?;
        return create_metadata_from_item_required(&item, image_cache_dir);
    }
    
    let item: TmdbItem = response.json()?;
    create_metadata_from_item_required(&item, image_cache_dir)
}

fn create_metadata_from_item_required(
    item: &TmdbItem,
    image_cache_dir: &str,
) -> Result<TmdbMetadata, Box<dyn std::error::Error + Send + Sync>> {
    create_metadata_from_item(item, image_cache_dir)?
        .ok_or_else(|| "Failed to create metadata".into())
}

fn extract_id_from_input(input: &str) -> (String, &str) {
    let input = input.trim();
    
    // Pure numeric ID
    if input.chars().all(|c| c.is_ascii_digit()) {
        return (input.to_string(), "tmdb");
    }
    
    // IMDB ID (tt followed by digits)
    if let Some(caps) = regex::Regex::new(r"(tt\d+)")
        .ok()
        .and_then(|re| re.captures(input))
    {
        if let Some(m) = caps.get(1) {
            return (m.as_str().to_string(), "imdb");
        }
    }
    
    // TMDB movie URL
    if let Some(caps) = regex::Regex::new(r"themoviedb\.org/movie/(\d+)")
        .ok()
        .and_then(|re| re.captures(input))
    {
        if let Some(m) = caps.get(1) {
            return (m.as_str().to_string(), "tmdb");
        }
    }
    
    // TMDB TV URL
    if let Some(caps) = regex::Regex::new(r"themoviedb\.org/tv/(\d+)")
        .ok()
        .and_then(|re| re.captures(input))
    {
        if let Some(m) = caps.get(1) {
            return (m.as_str().to_string(), "tmdb");
        }
    }
    
    (input.to_string(), "tmdb")
}

/// Cache image from TMDB
fn cache_image(
    image_path: &str, 
    cache_dir: &str, 
    size: &str
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let filename = Path::new(image_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown.jpg");
    
    let local_path = Path::new(cache_dir).join(filename);
    
    if local_path.exists() {
        // Check if file is not empty
        if let Ok(metadata) = std::fs::metadata(&local_path) {
            if metadata.len() > 100 {
                return Ok(format!("image_cache/{}", filename));
            }
            // File is corrupted/empty, delete and re-download
            let _ = std::fs::remove_file(&local_path);
        }
    }
    
    let image_url = format!("https://image.tmdb.org/t/p/{}{}", size, image_path);
    
    let client = build_client()?;
    let response = client.get(&image_url).send()?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to download image: HTTP {}", response.status()).into());
    }
    
    let bytes = response.bytes()?;
    
    if bytes.len() < 100 {
        return Err("Downloaded image is too small (likely invalid)".into());
    }
    
    fs::create_dir_all(cache_dir)?;
    let mut file = fs::File::create(&local_path)?;
    file.write_all(&bytes)?;
    
    Ok(format!("image_cache/{}", filename))
}
