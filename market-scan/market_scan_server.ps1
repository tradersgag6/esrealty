# =====================================================================
#  Market Scan local scraper server (ES Realty)
#  A lightweight PowerShell HttpListener that scrapes public property
#  listing pages and serves normalized JSON to the Market Scan view.
#
#  Run:   powershell -ExecutionPolicy Bypass -File market_scan_server.ps1
#  (or double-click start_market_scan.cmd)
#
#  API:
#    GET /api/ping                    -> { ok: true }
#    GET /api/market-scan?city=&type=&mode=&minPrice=&maxPrice=
#                           &minArea=&minBeds=&maxResults=&live=
#      city      : free-text city/municipality (matched on listing location/title)
#      type      : "" | Vacant Lot | House & Lot | Townhouse | Condominium Unit
#                  | Apartment | Shophouse | Commercial | Warehouse | Office
#      mode      : sale | rent
#      minPrice  : minimum price (PHP), 0 = unset
#      maxPrice  : maximum price (PHP), 0 = unset
#      minArea   : minimum lot/floor area in sqm
#      minBeds   : minimum bedrooms
#      maxResults: cap on returned listings (default 40)
#      live      : 1 (include live web sources) | 0 (local benchmark only)
#
#  Sources:
#    dotproperty  : live scrape of dotproperty.com.ph listing pages
#    lamudi       : attempt (frequently blocked -> status "blocked")
#    zipmatch     : attempt (often unresolvable -> status "offline")
#    localbenchmark: deterministic generator from ES Realty benchmark data
#
#  Notes:
#    * Binds to http://localhost:<port>/ so no admin/ACL needed.
#    * Respect site load lightly: 1 page per type, short timeouts, 15-min cache.
# =====================================================================

param(
    [int]$Port = 8932
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$script:cache = @{}        # url -> @{ at = DateTime; html = string }
$cacheTtlSec  = 900

# ---------------------------------------------------------------- helpers

function New-FetchClient([int]$TimeoutSec = 14) {
    $c = New-Object System.Net.Http.HttpClient
    $c.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)
    $c.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
    $c.DefaultRequestHeaders.Add("Accept-Language", "en-PH,en;q=0.9")
    return $c
}

function Get-PageHtml([string]$Url, [int]$TimeoutSec = 14) {
    $now = Get-Date
    if ($script:cache.ContainsKey($Url)) {
        $hit = $script:cache[$Url]
        if (($now - $hit.at).TotalSeconds -lt $cacheTtlSec) { return $hit.html }
    }
    $client = New-FetchClient $TimeoutSec
    try {
        $resp = $client.GetAsync($Url).Result
        $html = $resp.Content.ReadAsStringAsync().Result
        if (-not $resp.IsSuccessStatusCode) { throw ("HTTP " + [int]$resp.StatusCode) }
        $script:cache[$Url] = @{ at = $now; html = $html }
        return $html
    } finally {
        $client.Dispose()
    }
}

# Cache probe outcomes (blocked/offline/ok) for 30 min so repeated searches
# do not re-wait on sites that consistently refuse our client.
$script:probeCache = @{}
$probeTtlSec = 1800

function Get-Probe([string]$Name, [scriptblock]$Fn) {
    $now = Get-Date
    if ($script:probeCache.ContainsKey($Name)) {
        $hit = $script:probeCache[$Name]
        if (($now - $hit.at).TotalSeconds -lt $probeTtlSec) { return $hit.result }
    }
    $result = & $Fn
    $script:probeCache[$Name] = @{ at = $now; result = $result }
    return $result
}

function ConvertTo-HtmlDecode([string]$S) {
    if ([string]::IsNullOrEmpty($S)) { return $S }
    return [System.Net.WebUtility]::HtmlDecode($S)
}

# "24,900,000" / "24.9M" / "12K" -> double (0 when not numeric)
function ConvertTo-Number([string]$Raw) {
    if ([string]::IsNullOrWhiteSpace($Raw)) { return 0 }
    $t = [regex]::Replace($Raw, "[^\d.MKB]", "")
    if ($t -match "^([\d.]+)\s*M$") { return [double]$matches[1] * 1e6 }
    if ($t -match "^([\d.]+)\s*K$") { return [double]$matches[1] * 1e3 }
    if ($t -match "^([\d.]+)\s*B$") { return [double]$matches[1] * 1e9 }
    if ($t -match "^([\d.]+)$")     { return [double]$matches[1] }
    return 0
}

function Split-Query([string]$QueryString) {
    $out = @{}
    if ([string]::IsNullOrEmpty($QueryString)) { return $out }
    foreach ($pair in $QueryString.TrimStart("?").Split("&")) {
        if ([string]::IsNullOrWhiteSpace($pair)) { continue }
        $kv = $pair.Split("=", 2)
        $k = [System.Uri]::UnescapeDataString($kv[0])
        $v = ""
        if ($kv.Length -gt 1) { $v = [System.Uri]::UnescapeDataString($kv[1]) }
        if ($k -ne "") { $out[$k] = $v }
    }
    return $out
}

function Send-Json($ctx, $status, $obj) {
    $resp = $ctx.Response
    $resp.StatusCode = $status
    $json = $obj | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $resp.ContentType = "application/json; charset=utf-8"
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    $resp.Close()
}

# ------------------------------------------------------------ benchmark data

# Mirrors js/data.js CITY_BENCHMARKS so the offline generator matches the app.
$script:BENCH = @{
    "Manila"=95000; "Makati"=220000; "Taguig"=210000; "Pasig"=140000; "Quezon City"=90000;
    "Mandaluyong"=150000; "Muntinlupa"=110000; "Parañaque"=100000; "Pasay"=120000;
    "Cebu City"=85000; "Lapu-Lapu"=60000; "Mandaue"=65000; "Davao City"=55000;
    "Iloilo City"=52000; "Bacolod"=42000; "Baguio"=58000; "Angeles"=48000;
    "San Fernando"=42000; "Cagayan de Oro"=46000; "Zamboanga City"=38000;
    "General Santos"=36000; "Tacloban"=34000; "Puerto Princesa"=32000; "Legazpi"=30000;
    "Butuan"=30000; "Naga"=32000; "Marawi"=26000; "Imus"=18500; "Bacoor"=17000;
    "Dasmariñas"=15000; "General Trias"=14000; "Santa Rosa"=28000; "Biñan"=24000;
    "Calamba"=20000; "Antipolo"=22000; "Meycauayan"=16000; "Silang"=12000; "Tagaytay"=26000;
    "Lipa"=18000; "Tanauan"=16000; "Malolos"=14000; "Santa Maria"=15000; "Taytay"=17000;
    "Cainta"=16000; "San Pedro"=19000; "Cabuyao"=20000; "Trece Martires"=12000;
    "Mariveles"=10000; "Balanga"=12000; "Coron"=28000; "Ormoc"=24000; "Talisay"=45000;
    "Minglanilla"=38000; "Mabalacat"=35000; "Batangas City"=22000
}

# dotproperty category slugs per requested type + mode (confirmed live).
# type key "" means "All types" -> uses the generic page set below.
$script:DP_TYPE = @{
    "Vacant Lot"       = @{ sale = "land-for-sale";            rent = $null }
    "House & Lot"      = @{ sale = "houses-for-sale";          rent = "houses-for-rent" }
    "Townhouse"        = @{ sale = "townhouses-for-sale";      rent = "townhouses-for-rent" }
    "Condominium Unit" = @{ sale = "condos-for-sale";          rent = "condos-for-rent" }
    "Apartment"        = @{ sale = "apartments-for-sale";      rent = "apartments-for-rent" }
    "Shophouse"        = @{ sale = "shophouse-for-sale";       rent = "shophouse-for-rent" }
    "Commercial"       = @{ sale = "commercial-property-for-sale"; rent = "commercial-property-for-rent" }
    "Warehouse"        = @{ sale = "warehouses-for-sale";      rent = "warehouses-for-rent" }
    "Office"           = @{ sale = "offices-for-sale";         rent = "offices-for-rent" }
}
$script:DP_ALL_SALE = @("houses-for-sale")
$script:DP_ALL_RENT = @("houses-for-rent")

# myproperty.ph type slugs (the last path segment of /buy/<slug>/ and /rent/<slug>/).
$script:MP_TYPE = @{
    "Vacant Lot"       = @{ sale = "land";       rent = "land" }
    "House & Lot"      = @{ sale = "house";      rent = "house" }
    "Townhouse"        = @{ sale = "townhouse";  rent = "townhouse" }
    "Condominium Unit" = @{ sale = "condo";      rent = "condo" }
    "Apartment"        = @{ sale = "apartment";  rent = "apartment" }
    "Commercial"       = @{ sale = "commercial"; rent = "commercial" }
    "Warehouse"        = @{ sale = "warehouse";  rent = "warehouse" }
    "Office"           = @{ sale = "office";     rent = "office" }
}

function Get-PropTypeFromTitle([string]$Title) {
    $s = " " + ($Title.ToLower()) + " "
    if ($s -match "warehouse")   { return "Warehouse" }
    if ($s -match "townhouse")   { return "Townhouse" }
    if ($s -match "shophouse")   { return "Shophouse" }
    if ($s -match "apartment")   { return "Apartment" }
    if ($s -match "office")      { return "Office" }
    if ($s -match "commercial")  { return "Commercial" }
    if ($s -match "condo|studio"){ return "Condominium Unit" }
    if ($s -match "house")       { return "House & Lot" }
    if ($s -match "lot|land")    { return "Vacant Lot" }
    return ""
}

function Get-DotPropertyPages($type, $mode) {
    $mode = if ($mode -eq "rent") { "rent" } else { "sale" }
    if ([string]::IsNullOrWhiteSpace($type) -or -not $script:DP_TYPE.ContainsKey($type)) {
        if ($mode -eq "rent") { return $script:DP_ALL_RENT }
        return $script:DP_ALL_SALE
    }
    $slug = $script:DP_TYPE[$type][$mode]
    if (-not $slug) { return @() }
    return @($slug)
}

# ------------------------------------------------------------ dotproperty parser

function ConvertFrom-DotPropertyCard($Card, $TypeFallback, $Mode) {
    $card = $Card
    $out = @{
        url = ""; title = ""; city = ""; price = 0; pricePerSqm = 0
        lotArea = 0; floorArea = 0; bedrooms = 0; bathrooms = 0
        propertyType = $TypeFallback; verified = $false; description = ""
    }

    $m = [regex]::Match($card, 'href="(https://www\.dotproperty\.com\.ph/ads/[^"]+)"')
    if ($m.Success) { $out.url = $m.Groups[1].Value }

    $m = [regex]::Match($card, '<div class="text-2xl font-semibold[^"]*"[^>]*title="([^"]+)"')
    if ($m.Success) { $out.title = ConvertTo-HtmlDecode $m.Groups[1].Value }

    $m = [regex]::Match($card, 'location-[a-z0-9]+\.svg[^>]*>\s*</span>\s*([^<]{2,80}?)\s*</div>')
    if ($m.Success) { $out.city = ConvertTo-HtmlDecode ($m.Groups[1].Value.Trim()) }

    $m = [regex]::Match($card, 'class="inline-block text-secondary-base[^"]*"[^>]*>([^<]*)')
    if ($m.Success) { $out.price = [int64](ConvertTo-Number $m.Groups[1].Value) }

    $m = [regex]::Match($card, '\(?\s*(?:₱)?\s*([\d][\d,\.\s]*(?:M|K)?)\s*/\s*m<sup>2</sup>')
    if ($m.Success) { $out.pricePerSqm = [int64](ConvertTo-Number $m.Groups[1].Value) }

    $m = [regex]::Match($card, 'resize-[a-z0-9]+\.svg[^>]*>\s*</span>\s*([\d][\d,\.]*)\s*m<sup>2</sup>')
    if ($m.Success) { $area = ConvertTo-Number $m.Groups[1].Value }

    $m = [regex]::Match($card, 'bed-[a-z0-9]+\.svg[^>]*>\s*</span>\s*([\d]+)')
    if ($m.Success) { $out.bedrooms = [int]$m.Groups[1].Value }

    $m = [regex]::Match($card, 'bathtub-[a-z0-9]+\.svg[^>]*>\s*</span>\s*([\d]+)')
    if ($m.Success) { $out.bathrooms = [int]$m.Groups[1].Value }

    $m = [regex]::Match($card, 'home-[a-z0-9]+\.svg[^>]*>\s*</span>\s*([A-Za-z][A-Za-z &-]+?)\s*</li>')
    if ($m.Success) { $out.propertyType = $m.Groups[1].Value.Trim() }

    if ($card -match 'verified') { $out.verified = $true }
    $m = [regex]::Match($card, 'class="line-clamp-4[^"]*"[^>]*>([\s\S]*?)</div>')
    if ($m.Success) { $out.description = ConvertTo-HtmlDecode (($m.Groups[1].Value -replace '<[^>]+>', " " -replace '\s+', " ").Trim()) }

    if ($TypeFallback -eq "Vacant Lot" -and $area -gt 0) { $out.lotArea = $area }
    else { $out.floorArea = $area }
    return $out
}

function Invoke-DotProperty($Query) {
    $mode = if ($Query.mode -eq "rent") { "rent" } else { "sale" }
    $pages = Get-DotPropertyPages $Query.type $mode
    $all = @()
    $lastErr = ""
    $lastCount = 0
    foreach ($slug in $pages) {
        try {
            $html = Get-PageHtml ("https://www.dotproperty.com.ph/" + $slug)
            $cards = [regex]::Matches($html, '<article\s+class="listing-snippet.*?</article>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
            $typeFallback = if ($Query.type) { $Query.type } else { ($slug -split "-for-")[0] }
            foreach ($c in $cards) {
                $all += (ConvertFrom-DotPropertyCard $c.Value $typeFallback $mode)
            }
            $lastCount += $cards.Count
        } catch {
            $lastErr = $_.Exception.Message
        }
    }
    $status = "ok"
    if ($all.Count -eq 0 -and $lastErr -ne "") { $status = "error" }
    return @{ status = $status; count = $all.Count; error = $lastErr; listings = $all }
}

# ------------------------------------------------------------ myproperty parser

# myproperty.ph exposes real estate listings as ld+json (RealEstateListing),
# which gives clean structured fields.
function ConvertFrom-MyPropertyListing($X, $Mode, $QueryType, $PageSlug) {
    $area = 0
    if ($X.floorSize -and $X.floorSize.value) { $area = [int](ConvertTo-Number ([string]$X.floorSize.value)) }
    $price = 0
    if ($X.offers) {
        $o = $X.offers
        if ($o -is [array] -and $o.Count -gt 0) { $o = $o[0] }
        if ($o.price) { $price = [int64](ConvertTo-Number ([string]$o.price)) }
    }
    $beds = 0
    if ($X.numberOfBedrooms) { $beds = [int]$X.numberOfBedrooms }
    $baths = 0
    if ($X.numberOfBathroomsTotal) { $baths = [int]$X.numberOfBathroomsTotal }
    $city = ""; $region = ""; $address = ""
    if ($X.address) {
        if ($X.address.addressLocality) { $city = ConvertTo-HtmlDecode ([string]$X.address.addressLocality) }
        if ($X.address.addressRegion)   { $region = ConvertTo-HtmlDecode ([string]$X.address.addressRegion) }
        if ($X.address.streetAddress)   { $address = ConvertTo-HtmlDecode ([string]$X.address.streetAddress) }
    }
    $lat = ""; $lng = ""
    if ($X.geo) { $lat = [string]$X.geo.latitude; $lng = [string]$X.geo.longitude }

    $ptype = $QueryType
    if (-not $ptype) {
        $ptype = Get-PropTypeFromTitle ([string]$X.name)
        if (-not $ptype -and $PageSlug) {
            $ptype = @{ "land" = "Vacant Lot"; "house" = "House & Lot"; "townhouse" = "Townhouse"; "condo" = "Condominium Unit"; "apartment" = "Apartment"; "commercial" = "Commercial"; "warehouse" = "Warehouse"; "office" = "Office" }[$PageSlug]
        }
        if (-not $ptype) { $ptype = "" }
    }

    $out = @{
        url = if ($X.url) { [string]$X.url } else { "" }
        title = ConvertTo-HtmlDecode ([string]$X.name)
        city = if ($city) { $city } elseif ($region) { $region } else { "" }
        price = $price; pricePerSqm = 0
        lotArea = 0; floorArea = $area
        bedrooms = $beds; bathrooms = $baths
        propertyType = $ptype; verified = $false
        description = ConvertTo-HtmlDecode ([string]$X.description)
    }
    if ($ptype -eq "Vacant Lot" -and $area -gt 0) { $out.lotArea = $area; $out.floorArea = 0 }
    if ($area -gt 0 -and $price -gt 0 -and $Mode -ne "rent") { $out.pricePerSqm = [int64]($price / $area) }
    return $out
}

function Invoke-MyProperty($Query) {
    $mode = if ($Query.mode -eq "rent") { "rent" } else { "buy" }
    $slug = ""
    if ($Query.type -and $script:MP_TYPE.ContainsKey($Query.type)) { $slug = $script:MP_TYPE[$Query.type][$Query.mode] }
    $url = "https://www.myproperty.ph/$mode/"
    if ($slug) { $url = "https://www.myproperty.ph/$mode/$slug/" }
    $all = @(); $lastErr = ""
    try {
        $html = Get-PageHtml $url
        $m = [regex]::Match($html, '<script type="application/ld\+json">([\s\S]*?)</script>')
        if ($m.Success) {
            $obj = $m.Groups[1].Value | ConvertFrom-Json
            $about = if ($obj.about -is [array]) { $obj.about } else { @($obj.about) }
            foreach ($x in $about) { $all += (ConvertFrom-MyPropertyListing $x $Query.mode $Query.type $slug) }
        }
    } catch { $lastErr = $_.Exception.Message }
    $status = "ok"
    if ($all.Count -eq 0 -and $lastErr -ne "") { $status = "error" }
    return @{ status = $status; count = $all.Count; error = $lastErr; listings = $all }
}

# ------------------------------------------------------------ social media (probes)

# Facebook / Instagram / TikTok require login or are JavaScript-only shells.
# These adapters attempt the public endpoint and honestly report the wall type;
# results are cached so repeated searches do not re-wait on them.

function Invoke-Facebook($Query) {
    return Get-Probe "facebook" {
        try {
            $html = Get-PageHtml "https://www.facebook.com/marketplace/" 8
            if ([string]::IsNullOrWhiteSpace($html) -or $html.Length -lt 500) { return @{ status = "blocked"; count = 0; error = "requires Facebook login (session cookie); not scrapeable without authentication"; listings = @() } }
            return @{ status = "blocked"; count = 0; error = "login-walled; Marketplace listings are not exposed to anonymous clients"; listings = @() }
        } catch { return @{ status = "blocked"; count = 0; error = $_.Exception.Message; listings = @() } }
    }
}

function Invoke-Instagram($Query) {
    return Get-Probe "instagram" {
        try {
            $html = Get-PageHtml "https://www.instagram.com/explore/tags/property/" 8
            if ([string]::IsNullOrWhiteSpace($html)) { return @{ status = "js-only"; count = 0; error = "serves a JavaScript-only shell (login wall); no listings exposed to plain requests"; listings = @() } }
            return @{ status = "blocked"; count = 0; error = "no public listing data parseable"; listings = @() }
        } catch { return @{ status = "blocked"; count = 0; error = $_.Exception.Message; listings = @() } }
    }
}

function Invoke-TikTok($Query) {
    return Get-Probe "tiktok" {
        try {
            $html = Get-PageHtml "https://www.tiktok.com/tag/property" 8
            if ($html.Length -lt 10000) { return @{ status = "blocked"; count = 0; error = "access denied"; listings = @() } }
            return @{ status = "js-only"; count = 0; error = "client-rendered feed; no structured property listings"; listings = @() }
        } catch { return @{ status = "blocked"; count = 0; error = $_.Exception.Message; listings = @() } }
    }
}

# ------------------------------------------------------------ lamudi / zipmatch

function Invoke-Lamudi($Query) {
    # lamudi.com.ph returns 401 to non-browser clients; attempt anyway and report.
    $result = Get-Probe "lamudi" {
        try {
            $html = Get-PageHtml "https://www.lamudi.com.ph/for-sale/" 6
            $n = [regex]::Matches($html, 'data-id="[^"]+"').Count
            if ($n -gt 0) { return @{ status = "ok"; count = 0; error = "parsed but schema not implemented"; listings = @() } }
            return @{ status = "blocked"; count = 0; error = "HTTP 401 / access denied (site blocks local scrapers)"; listings = @() }
        } catch {
            return @{ status = "blocked"; count = 0; error = $_.Exception.Message; listings = @() }
        }
    }
    return $result
}

function Invoke-ZipMatch($Query) {
    $result = Get-Probe "zipmatch" {
        try {
            $html = Get-PageHtml "https://www.zipmatch.com/buy" 6
            $n = [regex]::Matches($html, 'property-card').Count
            return @{ status = "ok"; count = $n; error = ""; listings = @() }
        } catch {
            return @{ status = "offline"; count = 0; error = "host unreachable from this network"; listings = @() }
        }
    }
    return $result
}

# ------------------------------------------------------------ web search (Google -> DuckDuckGo fallback)

# Build a search phrase from the query filters, e.g. "Vacant Lot for sale Imus Philippines".
function Get-SearchQueryText($Query) {
    $parts = @()
    if ($Query.type) { $parts += $Query.type }
    $parts += if ($Query.mode -eq "rent") { "for rent" } else { "for sale" }
    if ($Query.city) { $parts += $Query.city }
    $parts += "Philippines"
    return ($parts -join " ")
}

function New-SearchListing($Title, $Url, $Snippet, $Query) {
    return @{
        url = $Url; title = $Title; city = $Query.city; price = 0; pricePerSqm = 0
        lotArea = 0; floorArea = 0; bedrooms = 0; bathrooms = 0
        propertyType = $Query.type; verified = $false
        description = $Snippet
    }
}

function ConvertFrom-SearchHtml($Html, $Engine, $Query) {
    $list = @()
    $seen = @{}
    if ($Engine -eq "google") {
        # google result rows: <a href="/url?q=REAL_URL&...">...<h3 ...>TITLE</h3>...</a>
        foreach ($m in [regex]::Matches($Html, 'href="/url\?q=([^&"]+)[^"]*"[^>]*>(?:(?!</a>).)*?<h3[^>]*>(.*?)</h3>', 'Singleline')) {
            $u = ConvertTo-HtmlDecode ([System.Uri]::UnescapeDataString($m.Groups[1].Value))
            $t = [regex]::Replace((ConvertTo-HtmlDecode ([regex]::Replace($m.Groups[2].Value, "<[^>]+>", ""))), "\s+", " ").Trim()
            if ($u -match "^https?://" -and $t -ne "" -and -not $seen.ContainsKey($u)) {
                $seen[$u] = $true
                $list += (New-SearchListing $t $u "" $Query)
            }
        }
    }
    else {
        # duckduckgo html: <div class="result ... web-result"> ... <a ... class="result__a" href="URL">TITLE</a>
        foreach ($b in ([regex]::Split($Html, '(?=<div class="result[^"]* web-result)'))) {
            $am = [regex]::Match($b, 'class="result__a" href="([^"]+)"[^>]*>(.*?)</a>', 'Singleline')
            if (-not $am.Success) { continue }
            $u = ConvertTo-HtmlDecode ($am.Groups[1].Value)
            if ($u -match "uddg=([^&]+)") { $u = [System.Uri]::UnescapeDataString($matches[1]) }
            if (-not ($u -match "^https?://")) { continue }
            $t = [regex]::Replace((ConvertTo-HtmlDecode ([regex]::Replace($am.Groups[2].Value, "<[^>]+>", ""))), "\s+", " ").Trim()
            if ($t -eq "" -or $seen.ContainsKey($u)) { continue }
            $sm = [regex]::Match($b, 'class="result__snippet"[^>]*>(.*?)</a>', 'Singleline')
            $sn = ""
            if ($sm.Success) { $sn = [regex]::Replace((ConvertTo-HtmlDecode ([regex]::Replace($sm.Groups[1].Value, "<[^>]+>", ""))), "\s+", " ").Trim() }
            $seen[$u] = $true
            $list += (New-SearchListing $t $u $sn $Query)
        }
    }
    return $list
}

# Try Google first; if it is CAPTCHA-walled (usual for anonymous scrapers) fall back to
# DuckDuckGo's HTML endpoint, which is scrape-friendly and returns real result links.
function Invoke-WebSearch($Query, [string]$Site = "") {
    $qtext = Get-SearchQueryText $Query
    if (-not [string]::IsNullOrWhiteSpace($Site)) { $qtext += " site:" + $Site }
    $enc = [System.Uri]::EscapeDataString($qtext)
    $html = ""
    $err = ""

    # 1) Google
    try {
        $html = Get-PageHtml ("https://www.google.com/search?num=20&hl=en&q=" + $enc) 6
        $blocked = [string]::IsNullOrWhiteSpace($html) -or $html.Length -lt 2000 -or
                   ($html -match "unusual traffic|enablejs|/sorry/|captcha|not a robot")
        if ($blocked) {
            $err = "Google blocked the request (bot detection / CAPTCHA); fell back to DuckDuckGo"
            $html = ""
        }
    } catch {
        $err = "Google request failed (" + $_.Exception.Message + "); fell back to DuckDuckGo"
        $html = ""
    }
    if (-not [string]::IsNullOrWhiteSpace($html)) {
        $list = ConvertFrom-SearchHtml $html "google" $Query
        if ($list.Count -gt 0) {
            return @{ status = "ok"; engine = "google"; count = $list.Count; error = ""; listings = $list }
        }
        $err = "Google returned no parseable results; fell back to DuckDuckGo"
        $html = ""
    }

    # 2) DuckDuckGo HTML fallback
    try {
        $html = Get-PageHtml ("https://html.duckduckgo.com/html/?q=" + $enc) 10
        $list = ConvertFrom-SearchHtml $html "duckduckgo" $Query
        if ($list.Count -gt 0) {
            return @{ status = "ok"; engine = "duckduckgo"; count = $list.Count; error = $err; listings = $list }
        }
        return @{ status = "blocked"; engine = "duckduckgo"; count = 0; error = "DuckDuckGo returned no results"; listings = @() }
    } catch {
        return @{ status = "blocked"; engine = "duckduckgo"; count = 0; error = "DuckDuckGo failed: " + $_.Exception.Message; listings = @() }
    }
}

# Bing is a useful independent fallback for publicly indexed Facebook pages/posts.
# It returns links only; Marketplace, private groups, and login-gated content remain unavailable.
function Invoke-FacebookPublicSearch($Query) {
    $qtext = (Get-SearchQueryText $Query) + " site:facebook.com"
    $enc = [System.Uri]::EscapeDataString($qtext)
    try {
        $html = Get-PageHtml ("https://www.bing.com/search?count=20&q=" + $enc) 10
        $list = @(); $seen = @{}
        foreach ($m in [regex]::Matches($html, '<li class="b_algo"[\s\S]*?<h2[^>]*><a href="([^"]+)"[^>]*>([\s\S]*?)</a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)</p>)?', 'IgnoreCase')) {
            $url = ConvertTo-HtmlDecode $m.Groups[1].Value
            if (-not ($url -match '^https?://(?:www\.|m\.)?facebook\.com/') -or $seen.ContainsKey($url)) { continue }
            $title = [regex]::Replace((ConvertTo-HtmlDecode ([regex]::Replace($m.Groups[2].Value, '<[^>]+>', ''))), '\s+', ' ').Trim()
            if (-not $title) { continue }
            $snippet = [regex]::Replace((ConvertTo-HtmlDecode ([regex]::Replace($m.Groups[3].Value, '<[^>]+>', ''))), '\s+', ' ').Trim()
            $seen[$url] = $true
            $list += (New-SearchListing $title $url $snippet $Query)
        }
        if ($list.Count -gt 0) { return @{ status = "ok"; engine = "Bing"; count = $list.Count; error = ""; listings = $list } }
        return @{ status = "blocked"; engine = "Bing"; count = 0; error = "Bing returned no publicly indexed Facebook property posts for this search"; listings = @() }
    } catch {
        return @{ status = "blocked"; engine = "Bing"; count = 0; error = "Bing Facebook-post search failed: " + $_.Exception.Message; listings = @() }
    }
}

# Public-index discovery for additional property sites. This returns only pages
# exposed to search engines and does not attempt to bypass site authentication.
function Invoke-IndexedListingSite($Query, [string]$Site, [string]$Label) {
    $qtext = (Get-SearchQueryText $Query) + " site:" + $Site
    $enc = [System.Uri]::EscapeDataString($qtext)
    $pattern = '^https?://(?:www\.)?' + [regex]::Escape($Site) + '/'
    try {
        $html = Get-PageHtml ("https://www.bing.com/search?count=20&q=" + $enc) 10
        $list = @(); $seen = @{}
        foreach ($m in [regex]::Matches($html, '<li class="b_algo"[\s\S]*?<h2[^>]*><a href="([^"]+)"[^>]*>([\s\S]*?)</a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)</p>)?', 'IgnoreCase')) {
            $url = ConvertTo-HtmlDecode $m.Groups[1].Value
            if (-not ($url -match $pattern) -or $seen.ContainsKey($url)) { continue }
            $title = [regex]::Replace((ConvertTo-HtmlDecode ([regex]::Replace($m.Groups[2].Value, '<[^>]+>', ''))), '\s+', ' ').Trim()
            if (-not $title) { continue }
            $snippet = [regex]::Replace((ConvertTo-HtmlDecode ([regex]::Replace($m.Groups[3].Value, '<[^>]+>', ''))), '\s+', ' ').Trim()
            $seen[$url] = $true
            $list += (New-SearchListing $title $url $snippet $Query)
        }
        if ($list.Count -gt 0) { return @{ status = "ok"; engine = "Bing"; count = $list.Count; error = ""; listings = $list } }
        return @{ status = "blocked"; engine = "Bing"; count = 0; error = "Bing returned no publicly indexed $Label listings for this search"; listings = @() }
    } catch {
        return @{ status = "blocked"; engine = "Bing"; count = 0; error = "$Label search failed: " + $_.Exception.Message; listings = @() }
    }
}

# ------------------------------------------------------------ local benchmark source

function New-BenchmarkListing($City, $Bench, $Type, $Mode, $Seed) {
    $rng = New-Object System.Random($Seed)
    $lot   = 0; $floor = 0
    switch ($Type) {
        "Vacant Lot"       { $lot   = $rng.Next(80, 600) }
        "House & Lot"      { $lot   = $rng.Next(60, 240); $floor = [int]($lot * (0.7 + $rng.NextDouble() * 0.6)) }
        "Townhouse"        { $lot   = $rng.Next(45, 160); $floor = [int]($lot * (0.8 + $rng.NextDouble() * 0.5)) }
        "Condominium Unit" { $floor = $rng.Next(20, 140) }
        "Apartment"        { $floor = $rng.Next(18, 120) }
        "Shophouse"        { $floor = $rng.Next(30, 220) }
        "Commercial"       { $floor = $rng.Next(50, 400) }
        "Warehouse"        { $floor = $rng.Next(100, 600) }
        "Office"           { $floor = $rng.Next(40, 300) }
        default            { $lot   = $rng.Next(80, 400); $floor = 0 }
    }
    $area = if ($lot -gt 0) { $lot } else { $floor }
    if ($area -le 0) { $area = 120 }
    $factor = 0.85 + $rng.NextDouble() * 0.45
    if ($Mode -eq "rent") {
        # monthly rent ≈ 0.05%–0.09% of indicative value per month
        $value = $Bench * $area * $factor
        $rent  = [int64]($value * (0.0005 + $rng.NextDouble() * 0.0004))
        $price = $rent
    } else {
        $price = [int64]($Bench * $area * $factor)
        $price = [int64]([Math]::Ceiling($price / 10000) * 10000)
    }
    $beds = 0
    if ($Type -ne "Vacant Lot" -and $Type -ne "Warehouse" -and $Type -ne "Office" -and $Type -ne "Commercial") {
        $beds = $rng.Next(1, 5)
    }
    $modeWord = if ($Mode -eq "rent") { "for rent" } else { "for sale" }
    $title = "$beds Bedroom $Type $modeWord in $City"
    if ($Type -eq "Vacant Lot") { $title = "$area sqm $Type $modeWord in $City" }
    return @{
        url = ""; title = $title; city = $City; price = $price
        pricePerSqm = if ($area -gt 0 -and $Mode -ne "rent") { [int64]($price / $area) } else { 0 }
        lotArea = $lot; floorArea = $floor; bedrooms = $beds; bathrooms = 0
        propertyType = $Type; verified = $false
        description = "Generated from the ES Realty benchmark table for $City (indicative ₱$Bench/sqm) — reference data, not a live listing."
    }
}

function Invoke-LocalBenchmark($Query) {
    $mode = if ($Query.mode -eq "rent") { "rent" } else { "sale" }
    $types = @("Vacant Lot", "House & Lot", "Townhouse", "Condominium Unit", "Apartment", "Shophouse", "Commercial", "Warehouse", "Office")
    if ($Query.type) { $types = @($Query.type) }
    if ($mode -eq "rent") {
        $types = @($types | Where-Object { $_ -ne "Vacant Lot" -and $_ -ne "Warehouse" })
    }
    $list = @()
    $seed = 1
    foreach ($t in $types) {
        foreach ($kv in $script:BENCH.GetEnumerator() | Sort-Object Name) {
            $seed++
            $list += (New-BenchmarkListing $kv.Key $kv.Value $t $mode $seed)
        }
    }
    return @{ status = "ok"; count = $list.Count; error = ""; listings = $list }
}

# ------------------------------------------------------------ filtering

function Test-ListingMatch($L, $Query) {
    $city = [string]$Query.city
    if (-not [string]::IsNullOrWhiteSpace($city)) {
        $hay = ($L.city + " " + $L.title).ToLower()
        $needle = $city.ToLower().Trim()
        if ($needle -ne "" -and $hay.IndexOf($needle) -lt 0) { return $false }
    }
    if ($L.price -gt 0) {
        $min = [double]$Query.minPrice; $max = [double]$Query.maxPrice
        if ($min -gt 0 -and $L.price -lt $min) { return $false }
        if ($max -gt 0 -and $L.price -gt $max) { return $false }
    }
    $minArea = [double]$Query.minArea
    if ($minArea -gt 0) {
        $area = 0; if ($L.lotArea -gt 0) { $area = $L.lotArea } elseif ($L.floorArea -gt 0) { $area = $L.floorArea }
        if ($area -lt $minArea) { return $false }
    }
    $minBeds = [int]$Query.minBeds
    if ($minBeds -gt 0 -and $L.bedrooms -lt $minBeds) { return $false }
    return $true
}

function Merge-QueryDefaults($q) {
    $d = @{
        city = [string]$q.city
        type = [string]$q.type
        mode = if ([string]$q.mode -eq "rent") { "rent" } else { "sale" }
        minPrice = 0; maxPrice = 0; minArea = 0; minBeds = 0; maxResults = 40; live = $true
    }
    $d.minPrice   = [double](([string]$q.minPrice).Trim());  if ([double]$d.minPrice -lt 0)   { $d.minPrice = 0 }
    $d.maxPrice   = [double](([string]$q.maxPrice).Trim());  if ([double]$d.maxPrice -lt 0)   { $d.maxPrice = 0 }
    $d.minArea    = [double](([string]$q.minArea).Trim());   if ([double]$d.minArea -lt 0)    { $d.minArea = 0 }
    $d.minBeds    = [int](([string]$q.minBeds).Trim());      if ($d.minBeds -lt 0)            { $d.minBeds = 0 }
    $d.maxResults = [int](([string]$q.maxResults).Trim());   if ($d.maxResults -le 0)         { $d.maxResults = 40 }
    $live = ([string]$q.live).Trim()
    if ($live -eq "0" -or $live -eq "false") { $d.live = $false }
    return $d
}

# ------------------------------------------------------------ handlers

function Handle-MarketScan($ctx, $QueryString) {
    $q = Merge-QueryDefaults (Split-Query $QueryString)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $sources = @()
    $listings = @()

    $dot = @{ status = "skipped"; count = 0; error = ""; listings = @() }
    $mp  = @{ status = "skipped"; count = 0; error = ""; listings = @() }
    if ($q.live) {
        $dot = Invoke-DotProperty $q
        foreach ($l in $dot.listings) { $l.source = "dotproperty"; $l.sourceLabel = "DotProperty.com.ph"; $listings += $l }
        $mp = Invoke-MyProperty $q
        foreach ($l in $mp.listings) { $l.source = "myproperty"; $l.sourceLabel = "MyProperty.ph"; $listings += $l }
    }
    $sources += @{ name = "dotproperty"; label = "DotProperty.com.ph"; status = $dot.status; count = $dot.count; error = $dot.error }
    $sources += @{ name = "myproperty"; label = "MyProperty.ph"; status = $mp.status; count = $mp.count; error = $mp.error }

    if ($q.live) {
        $ws = Invoke-WebSearch $q
        $wsEngine = if ($ws.engine -eq "google") { "Google" } else { "DuckDuckGo" }
        $sources += @{ name = "websearch"; label = "Web Search ($wsEngine)"; status = $ws.status; count = $ws.count; error = $ws.error }
        foreach ($l in $ws.listings) { $l.source = "websearch"; $l.sourceLabel = "Web Search · $wsEngine"; $listings += $l }

        # Facebook Marketplace and many groups require login, but public page/group
        # posts indexed by search engines can still be surfaced as external links.
        $fbPublic = Invoke-FacebookPublicSearch $q
        $fbPublicEngine = $fbPublic.engine
        $sources += @{ name = "facebookpublic"; label = "Facebook Public Posts ($fbPublicEngine)"; status = $fbPublic.status; count = $fbPublic.count; error = $fbPublic.error }
        foreach ($l in $fbPublic.listings) { $l.source = "facebookpublic"; $l.sourceLabel = "Facebook Public Post · $fbPublicEngine"; $listings += $l }

        foreach ($site in @(
            @{ name = "onepropertee"; domain = "onepropertee.com"; label = "OnePropertee" },
            @{ name = "carousell"; domain = "carousell.ph"; label = "Carousell Philippines" }
        )) {
            $siteResult = Invoke-IndexedListingSite $q $site.domain $site.label
            $sources += @{ name = $site.name; label = ($site.label + " (" + $siteResult.engine + ")"); status = $siteResult.status; count = $siteResult.count; error = $siteResult.error }
            foreach ($l in $siteResult.listings) { $l.source = $site.name; $l.sourceLabel = ($site.label + " · " + $siteResult.engine); $listings += $l }
        }

        $lam = Invoke-Lamudi $q
        $sources += @{ name = "lamudi"; label = "Lamudi"; status = $lam.status; count = $lam.count; error = $lam.error }

        $zip = Invoke-ZipMatch $q
        $sources += @{ name = "zipmatch"; label = "ZipMatch"; status = $zip.status; count = $zip.count; error = $zip.error }

        $fb = Invoke-Facebook $q
        $sources += @{ name = "facebook"; label = "Facebook Marketplace"; status = $fb.status; count = $fb.count; error = $fb.error }

        $ig = Invoke-Instagram $q
        $sources += @{ name = "instagram"; label = "Instagram (#property)"; status = $ig.status; count = $ig.count; error = $ig.error }

        $tt = Invoke-TikTok $q
        $sources += @{ name = "tiktok"; label = "TikTok (#property)"; status = $tt.status; count = $tt.count; error = $tt.error }
    }

    $lb = Invoke-LocalBenchmark $q
    $sources += @{ name = "localbenchmark"; label = "Local Benchmark (offline)"; status = $lb.status; count = $lb.count; error = $lb.error }
    foreach ($l in $lb.listings) { $l.source = "localbenchmark"; $l.sourceLabel = "Local Benchmark"; $listings += $l }

    $filtered = @($listings | Where-Object { Test-ListingMatch $_ $q })
    $sw.Stop()
    $payload = @{
        ok = $true
        query = @{
            city = $q.city; type = $q.type; mode = $q.mode
            minPrice = $q.minPrice; maxPrice = $q.maxPrice
            minArea = $q.minArea; minBeds = $q.minBeds
            maxResults = $q.maxResults; live = $q.live
        }
        sources = $sources
        total = $filtered.Count
        shown = [Math]::Min($q.maxResults, $filtered.Count)
        listings = @($filtered | Select-Object -First $q.maxResults)
        elapsedMs = [int]$sw.ElapsedMilliseconds
        serverTime = (Get-Date).ToString("s")
    }
    Send-Json $ctx 200 $payload
}

# ------------------------------------------------------------ main loop

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Market Scan server listening on $prefix"
Write-Host "Try:   Invoke-RestMethod 'http://localhost:$Port/api/ping'"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $resp = $ctx.Response
        $resp.Headers.Add("Access-Control-Allow-Origin", "*")
        $resp.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS")
        $resp.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

        if ($req.HttpMethod -eq "OPTIONS") { $resp.StatusCode = 204; $resp.Close(); continue }

        try {
            $path = $req.Url.AbsolutePath
            if ($path -eq "/api/ping") {
                Send-Json $ctx 200 @{ ok = $true; server = "market-scan"; time = (Get-Date).ToString("s") }
            }
            elseif ($path -eq "/api/market-scan") {
                Handle-MarketScan $ctx $req.Url.Query
            }
            else {
                Send-Json $ctx 404 @{ ok = $false; error = "Not found: $path" }
            }
        } catch {
            try { Send-Json $ctx 500 @{ ok = $false; error = $_.Exception.Message } } catch {}
        }
    }
} finally {
    $listener.Stop()
}
