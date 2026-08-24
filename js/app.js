/* ============================================================
   ES Realty — Application layer
   Auth (demo), navigation, wizard, analysis, portfolio, reports,
   assistant. Vanilla JS SPA, localStorage persistence.
   ============================================================ */
(function () {
  "use strict";
  const C = window.ESREALTY.core;
  const D = window.ESREALTY.data;
  /* Supabase loads lazily (async) so it may not exist yet at parse time.
   * SB stays live-bound: picked up immediately or as soon as the client lands. */
  let SB = window.ESREALTY_SUPABASE || null;
  let sbReadyResolve = null;
  const sbReadyPromise = new Promise(function (resolve) { sbReadyResolve = resolve; });
  function bindSb() {
    if (!SB && window.ESREALTY_SUPABASE) {
      SB = window.ESREALTY_SUPABASE;
      if (sbReadyResolve) { const r = sbReadyResolve; sbReadyResolve = null; r(SB); }
      return true;
    }
    return false;
  }
  bindSb();
  if (!SB) {
    let sbTries = 0;
    const sbTimer = setInterval(function () {
      if (bindSb() || ++sbTries > 90) clearInterval(sbTimer);
    }, 200);
  }
  /* Resolves true once the lazily-loaded client is bound; false on timeout. */
  function sbUp(timeoutMs) {
    if (SB) return Promise.resolve(true);
    return Promise.race([
      sbReadyPromise.then(function () { return true; }),
      new Promise(function (resolve) { setTimeout(function () { resolve(false); }, timeoutMs || 12000); })
    ]);
  }
  const LISTINGS_API = window.ESREALTY_LISTINGS_API;
  const IS_LOCAL_DEV = ["localhost", "127.0.0.1"].indexOf(window.location.hostname) !== -1;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const friendlyErr = s => {
    const low = String(s == null ? "" : s).toLowerCase();
    if (low.indexOf("database error querying schema") >= 0 || /querying schema|failed to fetch schema/i.test(low)) return "Please contact the administrator (database schema error).";
    return String(s == null ? "" : s);
  };
  const safeHttpsUrl = value => {
    try { const url = new URL(String(value || "")); return url.protocol === "https:" ? url.href : ""; } catch (e) { return ""; }
  };
  const safePaymentProofUrl = value => {
    const raw = String(value || "").trim();
    if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(raw)) return raw;
    return safeHttpsUrl(raw);
  };

  /* ================= NUMERIC INPUT FORMATTING ================= */
  // Editable numeric fields display thousands separators (1,234,567.89) and
  // always store plain numbers — every reader strips commas via C.num().
  const _grpInt = digits => digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "";
  function _fmtNumLive(raw) {
    const s0 = String(raw == null ? "" : raw);
    if (s0 === "" || s0 === "-") return s0;
    const neg = s0.charAt(0) === "-";
    let s = neg ? s0.slice(1) : s0;
    s = s.replace(/,/g, "");
    const dot = s.indexOf(".");
    const hasDot = dot !== -1;
    let int = hasDot ? s.slice(0, dot) : s;
    let dec = hasDot ? s.slice(dot + 1) : "";
    int = int.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    dec = dec.replace(/[^\d]/g, "").slice(0, 4);
    let out = _grpInt(int);
    if (hasDot) out += "." + dec;
    return (neg ? "-" : "") + out;
  }
  function _fmtNumInput(el) {
    const start = el.selectionStart, end = el.selectionEnd;
    if (start == null) { el.value = _fmtNumLive(el.value); return; }
    const digitsBefore = el.value.slice(0, start).replace(/\D/g, "").length;
    const newVal = _fmtNumLive(el.value);
    if (newVal === el.value) return;
    el.value = newVal;
    if (end > start) { try { el.setSelectionRange(newVal.length, newVal.length); } catch (e) {} return; }
    let pos = 0, seen = 0;
    for (let i = 0; i < newVal.length; i++) { if (/\d/.test(newVal[i])) { seen++; if (seen >= digitsBefore) { pos = i + 1; break; } } }
    try { el.setSelectionRange(pos, pos); } catch (e) {}
  }
  function _normalizeNumInput(el) {
    const v = _fmtNumLive(el.value);
    el.value = (v === "." || v === "-" || v === "-.") ? "" : v;
  }
  function bindNumFormatting() {
    document.addEventListener("input", e => {
      const el = e.target;
      if (el && el.tagName === "INPUT" && !el.readOnly && el.classList && el.classList.contains("input-num")) _fmtNumInput(el);
    });
    document.addEventListener("blur", e => {
      const el = e.target;
      if (el && el.tagName === "INPUT" && !el.readOnly && el.classList && el.classList.contains("input-num")) _normalizeNumInput(el);
    }, true);
  }

  /* ================= APPRAISAL CONSTANTS ================= */
  const APPRAISAL_NOTICE = "This is a computer-assisted draft valuation prepared for professional review. It is not a certified appraisal until reviewed, adjusted as necessary, and signed by a PRC-licensed Real Estate Appraiser in accordance with RA 9646.";
  const VALUE_BASES = {
    "Market Value": "The estimated amount for which a property should exchange on the date of valuation between a willing buyer and a willing seller in an arm\u2019s-length transaction after proper marketing, wherein the parties acted knowledgeably, prudently, and without compulsion.",
    "Investment Value": "The value of a property to a particular owner or prospective owner for individual investment or operational objectives.",
    "Fair Value": "The price that would be received to sell an asset or paid to transfer a liability in an orderly transaction between market participants at the measurement date."
  };
  const APPRAISAL_PURPOSES = ["Mortgage/Loan Security", "Sale/Purchase", "Taxation (BIR zonal/local assessment)", "Insurance", "Financial Reporting", "Litigation/Expropriation", "Joint Venture"];
  const TRANSACTION_TYPES = ["Arm\u2019s-length Sale", "Listing", "Auction"];
  const DATA_SOURCES = ["Broker", "Listing Portal", "BIR Zonal Value", "Public Record", "Other"];
  const APPR_TABS = [["setup", "Engagement"], ["details", "Property Details & Location"], ["comps", "Comparables"], ["adjust", "Adjustments"], ["approaches", "Approaches"], ["reconcile", "Reconciliation"], ["charts", "Charts"], ["report", "Report"]];

  /* ================= LISTINGS STOREFRONT ================= */
  const LISTING_TYPES = [
    ["house-and-lot", "House & Lot"], ["condominium", "Condominium"], ["lot-only", "Lot Only"],
    ["townhouse", "Townhouse"], ["shophouse", "Shophouse"], ["commercial", "Commercial"], ["industrial", "Industrial"],
    ["agricultural", "Agricultural"], ["foreclosed", "Foreclosed / Bank-Acquired"]
  ];
  const LISTING_STATUSES = [
    ["available", "Available"], ["reserved", "Reserved"], ["sold", "Sold"],
    ["rfo", "RFO (Ready for Occupancy)"], ["pre-selling", "Pre-Selling"]
  ];
  const LISTING_TITLES = [
    ["tct", "Transfer Certificate of Title"], ["cct", "Condominium Certificate of Title"], ["none", "No Title Yet"]
  ];
  const LISTING_ZONING = [
    ["residential", "Residential (R)"], ["commercial", "Commercial (C)"], ["industrial", "Industrial (I)"],
    ["agricultural", "Agricultural (A)"], ["mixed-use", "Mixed-Use"], ["institutional", "Institutional"],
    ["recreational", "Recreational"], ["residential-agri", "Residential-Agricultural (RA)"],
    ["residential-commercial", "Residential-Commercial (RC)"], ["resort", "Resort / Tourism"]
  ];
  const PH_GEO = {
    "NCR": { "Metro Manila": ["Caloocan", "Las Piñas", "Makati", "Malabon", "Mandaluyong", "Manila", "Marikina", "Muntinlupa", "Navotas", "Parañaque", "Pasay", "Pasig", "Pateros", "Quezon City", "San Juan", "Taguig", "Valenzuela"] },
    "CAR": { "Abra": ["Bangued", "Boliney", "Bucay", "Bucloc", "Daguioman", "Danglas", "Dolores", "La Paz", "Lacub", "Lagangilang", "Lagayan", "Langiden", "Licuan-Baay", "Luba", "Malibcong", "Manabo", "Peñarrubia", "Pidigan", "Pilar", "Sallapadan", "San Isidro", "San Juan", "San Quintin", "Tayum", "Tineg", "Tubo", "Villaviciosa"], "Apayao": ["Calanasan", "Conner", "Flora", "Kabugao", "Luna", "Pudtol", "Santa Marcela"], "Benguet": ["Atok", "Baguio", "Bakun", "Bokod", "Buguias", "Itogon", "Kabayan", "Kapangan", "Kibungan", "La Trinidad", "Mankayan", "Sablan", "Tuba", "Tublay"], "Ifugao": ["Aguinaldo", "Alfonso Lista", "Asipulo", "Banaue", "Hingyon", "Hungduan", "Kiangan", "Lagawe", "Lamut", "Mayoyao", "Tinoc"], "Kalinga": ["Balbalan", "Lubuagan", "Pasil", "Pinukpuk", "Rizal", "Tabuk", "Tanudan", "Tinglayan"], "Mountain Province": ["Barlig", "Bauko", "Besao", "Bontoc", "Natonin", "Paracelis", "Sabangan", "Sadanga", "Sagada", "Tadian"] },
    "Region I - Ilocos Region": { "Ilocos Norte": ["Adams", "Bacarra", "Badoc", "Bangui", "Banna", "Batac", "Burgos", "Carasi", "Currimao", "Dingras", "Dumalneg", "Laoag", "Marcos", "Nueva Era", "Pagudpud", "Paoay", "Pasuquin", "Piddig", "Pinili", "San Nicolas", "Sarrat", "Solsona", "Vintar"], "Ilocos Sur": ["Alilem", "Banayoyo", "Bantay", "Burgos", "Cabugao", "Candon", "Caoayan", "Cervantes", "Galimuyod", "Gregorio del Pilar", "Lidlidda", "Magsingal", "Nagbukel", "Narvacan", "Quirino", "Salcedo", "San Emilio", "San Esteban", "San Ildefonso", "San Juan", "San Vicente", "Santa", "Santa Catalina", "Santa Cruz", "Santa Lucia", "Santa Maria", "Santiago", "Santo Domingo", "Sigay", "Sinait", "Sugpon", "Suyo", "Tagudin", "Vigan"], "La Union": ["Agoo", "Aringay", "Bacnotan", "Bagulin", "Balaoan", "Bangar", "Bauang", "Burgos", "Caba", "Luna", "Naguilian", "Pugo", "Rosario", "San Fernando", "San Gabriel", "San Juan", "San Vicente", "Santol", "Santo Tomas", "Sudipen", "Tubao"], "Pangasinan": ["Agno", "Aguilar", "Alaminos", "Alcala", "Anda", "Asingan", "Balungao", "Bani", "Basista", "Bautista", "Bayambang", "Binalonan", "Binmaley", "Bolinao", "Bugallon", "Burgos", "Calasiao", "Dagupan", "Dasol", "Infanta", "Labrador", "Laoac", "Lingayen", "Mabini", "Malasiqui", "Manaoag", "Mangaldan", "Mangatarem", "Mapandan", "Natividad", "Pozorrubio", "Rosales", "San Carlos", "San Fabian", "San Jacinto", "San Manuel", "San Nicolas", "San Quintin", "Santa Barbara", "Santa Maria", "Santo Tomas", "Sison", "Sual", "Tayug", "Umingan", "Urbiztondo", "Urdaneta", "Villasis"] },
    "Region II - Cagayan Valley": { "Batanes": ["Basco", "Itbayat", "Ivana", "Mahatao", "Sabtang", "Uyugan"], "Cagayan": ["Abulug", "Alcala", "Allacapan", "Amulung", "Aparri", "Baggao", "Ballesteros", "Buguey", "Calayan", "Camalaniugan", "Claveria", "Enrile", "Gattaran", "Gonzaga", "Iguig", "Lal-lo", "Lasam", "Pamplona", "Peñablanca", "Piat", "Rizal", "Sanchez-Mira", "Santa Ana", "Santa Praxedes", "Santa Teresita", "Santo Niño", "Solana", "Tuao", "Tuguegarao"], "Isabela": ["Alicia", "Angadanan", "Aurora", "Benito Soliven", "Burgos", "Cabagan", "Cabatuan", "Cauayan", "Cordon", "Delfin Albano", "Dinapigue", "Divilacan", "Echague", "Gamu", "Ilagan", "Jones", "Luna", "Maconacon", "Mallig", "Naguilian", "Palanan", "Quezon", "Quirino", "Ramon", "Reina Mercedes", "Roxas", "San Agustin", "San Guillermo", "San Isidro", "San Manuel", "San Mariano", "San Mateo", "San Pablo", "Santa Maria", "Santiago", "Santo Tomas", "Tumauini"], "Nueva Vizcaya": ["Alfonso Castañeda", "Ambaguio", "Aritao", "Bagabag", "Bambang", "Bayombong", "Diadi", "Dupax del Norte", "Dupax del Sur", "Kasibu", "Kayapa", "Quezon", "Santa Fe", "Solano", "Villaverde"], "Quirino": ["Aglipay", "Cabarroguis", "Diffun", "Maddela", "Nagtipunan", "Saguday"] },
    "Region III - Central Luzon": { "Aurora": ["Baler", "Casiguran", "Dilasag", "Dinalungan", "Dingalan", "Dipaculao", "Maria Aurora", "San Luis"], "Bataan": ["Abucay", "Bagac", "Balanga", "Dinalupihan", "Hermosa", "Limay", "Mariveles", "Morong", "Orani", "Orion", "Pilar", "Samal"], "Bulacan": ["Angat", "Balagtas", "Baliuag", "Bocaue", "Bulakan", "Bustos", "Calumpit", "Doña Remedios Trinidad", "Guiguinto", "Hagonoy", "Malolos", "Marilao", "Meycauayan", "Norzagaray", "Obando", "Pandi", "Paombong", "Plaridel", "Pulilan", "San Ildefonso", "San Jose del Monte", "San Miguel", "San Rafael", "Santa Maria"], "Nueva Ecija": ["Aliaga", "Bongabon", "Cabiao", "Cabanatuan", "Carranglan", "Cuyapo", "Gabaldon", "Gapan", "General Mamerto Natividad", "General Tinio", "Guimba", "Jaen", "Laur", "Licab", "Llanera", "Lupao", "Muñoz", "Nampicuan", "Palayan", "Pantabangan", "Peñaranda", "Quezon", "Rizal", "San Antonio", "San Isidro", "San Jose", "San Leonardo", "Santa Rosa", "Santo Domingo", "Talavera", "Talugtug", "Zaragoza"], "Pampanga": ["Angeles", "Apalit", "Arayat", "Bacolor", "Candaba", "Floridablanca", "Guagua", "Lubao", "Mabalacat", "Macabebe", "Magalang", "Masantol", "Mexico", "Minalin", "Porac", "San Fernando", "San Luis", "San Simon", "Santa Ana", "Santa Rita", "Santo Tomas", "Sasmuan"], "Tarlac": ["Anao", "Bamban", "Camiling", "Capas", "Concepcion", "Gerona", "La Paz", "Mayantoc", "Moncada", "Paniqui", "Pura", "Ramos", "San Clemente", "San Jose", "San Manuel", "Santa Ignacia", "Tarlac City", "Victoria"], "Zambales": ["Botolan", "Cabangan", "Candelaria", "Castillejos", "Iba", "Masinloc", "Olongapo", "Palauig", "San Antonio", "San Felipe", "San Marcelino", "San Narciso", "San Salvador", "Subic"] },
    "Region IV-A - CALABARZON": { "Batangas": ["Agoncillo", "Alitagtag", "Balayan", "Balete", "Batangas City", "Bauan", "Calaca", "Calatagan", "Cuenca", "Ibaan", "Laurel", "Lemery", "Lian", "Lipa", "Lobo", "Mabini", "Malvar", "Mataasnakahoy", "Nasugbu", "Padre Garcia", "Rosario", "San Jose", "San Juan", "San Luis", "San Nicolas", "San Pascual", "Santa Teresita", "Santo Tomas", "Taal", "Talisay", "Tanauan", "Taysan", "Tingloy", "Tuy"], "Cavite": ["Alfonso", "Amadeo", "Bacoor", "Carmona", "Cavite City", "Dasmariñas", "General Emilio Aguinaldo", "General Mariano Alvarez", "General Trias", "Imus", "Indang", "Kawit", "Magallanes", "Maragondon", "Mendez", "Naic", "Noveleta", "Rosario", "Silang", "Tagaytay", "Tanza", "Ternate", "Trece Martires"], "Laguna": ["Alaminos", "Bay", "Biñan", "Cabuyao", "Calamba", "Calauan", "Cavinti", "Famy", "Kalayaan", "Liliw", "Los Baños", "Luisiana", "Lumban", "Mabitac", "Magdalena", "Majayjay", "Nagcarlan", "Paete", "Pagsanjan", "Pakil", "Pangil", "Pila", "Rizal", "San Pablo", "San Pedro", "Santa Cruz", "Santa Maria", "Santa Rosa", "Siniloan", "Victoria"], "Quezon": ["Agdangan", "Alabat", "Atimonan", "Buenavista", "Burdeos", "Calauag", "Candelaria", "Catanauan", "Dolores", "General Luna", "General Nakar", "Guinayangan", "Gumaca", "Infanta", "Jomalig", "Lopez", "Lucban", "Lucena", "Macalelon", "Mauban", "Mulanay", "Padre Burgos", "Pagbilao", "Panukulan", "Patnanungan", "Perez", "Pitogo", "Plaridel", "Polillo", "Quezon", "Real", "Sampaloc", "San Andres", "San Antonio", "San Francisco", "San Narciso", "Sariaya", "Tagkawayan", "Tayabas", "Tiaong", "Unisan"], "Rizal": ["Angono", "Antipolo", "Baras", "Binangonan", "Cainta", "Cardona", "Jalajala", "Morong", "Pililla", "Rodriguez", "San Mateo", "Tanay", "Taytay", "Teresa"] },
    "Region IV-B - MIMAROPA": { "Marinduque": ["Boac", "Buenavista", "Gasan", "Mogpog", "Santa Cruz", "Torrijos"], "Occidental Mindoro": ["Abra de Ilog", "Calintaan", "Looc", "Lubang", "Magsaysay", "Mamburao", "Paluan", "Rizal", "Sablayan", "San Jose", "Santa Cruz"], "Oriental Mindoro": ["Baco", "Bansud", "Bongabong", "Bulalacao", "Calapan", "Gloria", "Mansalay", "Naujan", "Pinamalayan", "Pola", "Puerto Galera", "Roxas", "San Teodoro", "Socorro", "Victoria"], "Palawan": ["Aborlan", "Agutaya", "Araceli", "Balabac", "Bataraza", "Brooke's Point", "Busuanga", "Cagayancillo", "Coron", "Culion", "Cuyo", "Dumaran", "El Nido", "Kalayaan", "Linapacan", "Magsaysay", "Narra", "Puerto Princesa", "Quezon", "Rizal", "Roxas", "San Vicente", "Sofronio Española", "Taytay"], "Romblon": ["Alcantara", "Banton", "Cajidiocan", "Calatrava", "Concepcion", "Corcuera", "Ferrol", "Looc", "Magdiwang", "Odiongan", "Romblon", "San Agustin", "San Andres", "San Fernando", "San Jose", "Santa Fe", "Santa Maria", "Sibuyan"] },
    "Region V - Bicol Region": { "Albay": ["Bacacay", "Camalig", "Daraga", "Guinobatan", "Jovellar", "Legazpi", "Libon", "Ligao", "Malilipot", "Malinao", "Manito", "Oas", "Pio Duran", "Polangui", "Rapu-Rapu", "Santo Domingo", "Tabaco", "Tiwi"], "Camarines Norte": ["Basud", "Capalonga", "Daet", "Jose Panganiban", "Labo", "Mercedes", "Paracale", "San Lorenzo Ruiz", "San Vicente", "Santa Elena", "Talisay", "Vinzons"], "Camarines Sur": ["Baao", "Balatan", "Bato", "Bombon", "Buhi", "Bula", "Cabusao", "Calabanga", "Camaligan", "Canaman", "Caramoan", "Del Gallego", "Gainza", "Garchitorena", "Goa", "Iriga", "Lagonoy", "Libmanan", "Lupi", "Magarao", "Milaor", "Minalabac", "Nabua", "Naga", "Ocampo", "Pamplona", "Pasacao", "Pili", "Presentacion", "Ragay", "Sagñay", "San Fernando", "San Jose", "Sipocot", "Siruma", "Tigaon", "Tinambac"], "Catanduanes": ["Bagamanoc", "Baras", "Bato", "Caramoran", "Gigmoto", "Pandan", "Panganiban", "San Andres", "San Miguel", "Viga", "Virac"], "Masbate": ["Aroroy", "Baleno", "Balud", "Batuan", "Cataingan", "Cawayan", "Claveria", "Dimasalang", "Esperanza", "Mandaon", "Masbate City", "Mobo", "Monreal", "Palanas", "Pio V. Corpuz", "Placer", "San Fernando", "San Jacinto", "San Pascual", "Uson"], "Sorsogon": ["Barcelona", "Bulan", "Bulusan", "Casiguran", "Castilla", "Donsol", "Gubat", "Irosin", "Juban", "Magallanes", "Matnog", "Pilar", "Prieto Diaz", "Santa Magdalena", "Sorsogon City"] },
    "Region VI - Western Visayas": { "Aklan": ["Altavas", "Balete", "Banga", "Batan", "Buruanga", "Ibajay", "Kalibo", "Lezo", "Libacao", "Madalag", "Makato", "Malay", "Malinao", "Nabas", "New Washington", "Numancia", "Tangalan"], "Antique": ["Anini-y", "Barbaza", "Belison", "Bugasong", "Caluya", "Culasi", "Hamtic", "Laua-an", "Libertad", "Pandan", "Patnongon", "San Jose de Buenavista", "San Remigio", "Sebaste", "Sibalom", "Tibiao", "Tobias Fornier", "Valderrama"], "Capiz": ["Cuartero", "Dao", "Dumalag", "Dumarao", "Ivisan", "Jamindan", "Ma-ayon", "Mambusao", "Panay", "Panitan", "Pilar", "Pontevedra", "President Roxas", "Roxas", "Sapian", "Sigma", "Tapaz"], "Guimaras": ["Buenavista", "Jordan", "Nueva Valencia", "San Lorenzo", "Sibunag"], "Iloilo": ["Ajuy", "Alimodian", "Anilao", "Badiangan", "Balasan", "Banate", "Barotac Nuevo", "Barotac Viejo", "Batad", "Bingawan", "Cabatuan", "Calinog", "Carles", "Concepcion", "Dingle", "Dueñas", "Dumangas", "Estancia", "Guimbal", "Igbaras", "Iloilo City", "Janiuay", "Lambunao", "Leganes", "Lemery", "Leon", "Maasin", "Miagao", "Mina", "New Lucena", "Oton", "Passi", "Pavia", "Pototan", "San Dionisio", "San Enrique", "San Joaquin", "San Miguel", "San Rafael", "Santa Barbara", "Sara", "Tigbauan", "Tubungan", "Zarraga"], "Negros Occidental": ["Bago", "Binalbagan", "Cadiz", "Calatrava", "Candoni", "Cauayan", "Enrique B. Magalona", "Escalante", "Himamaylan", "Hinigaran", "Hinoba-an", "Ilog", "Isabela", "Kabankalan", "La Carlota", "La Castellana", "Manapla", "Moises Padilla", "Murcia", "Pontevedra", "Pulupandan", "Sagay", "Salvador Benedicto", "San Carlos", "San Enrique", "Silay", "Sipalay", "Talisay", "Toboso", "Valladolid", "Victorias"] },
    "Region VII - Central Visayas": { "Bohol": ["Alburquerque", "Alicia", "Anda", "Antequera", "Baclayon", "Balilihan", "Batuan", "Bien Unido", "Bilar", "Buenavista", "Calape", "Candijay", "Carmen", "Catigbian", "Clarin", "Corella", "Cortes", "Dagohoy", "Danao", "Dauis", "Dimiao", "Duero", "Garcia Hernandez", "Getafe", "Guindulman", "Inabanga", "Jagna", "Lila", "Loay", "Loboc", "Loon", "Mabini", "Maribojoc", "Panglao", "Pilar", "President Carlos P. Garcia", "Sagbayan", "San Isidro", "San Miguel", "Sevilla", "Sierra Bullones", "Sikatuna", "Tagbilaran", "Talibon", "Trinidad", "Tubigon", "Ubay", "Valencia"], "Cebu": ["Alcantara", "Alcoy", "Alegria", "Aloguinsan", "Argao", "Asturias", "Badian", "Balamban", "Bantayan", "Barili", "Bogo", "Boljoon", "Borbon", "Carcar", "Carmen", "Catmon", "Cebu City", "Compostela", "Consolacion", "Cordova", "Daanbantayan", "Dalaguete", "Dumanjug", "Ginatilan", "Liloan", "Madridejos", "Malabuyoc", "Mandaue", "Medellin", "Minglanilla", "Moalboal", "Naga", "Oslob", "Pilar", "Pinamungajan", "Poro", "Ronda", "Samboan", "San Fernando", "San Francisco", "San Remigio", "Santa Fe", "Santander", "Sibonga", "Sogod", "Tabogon", "Tabuelan", "Talisay", "Toledo", "Tuburan", "Tudela"], "Negros Oriental": ["Amlan", "Ayungon", "Bacong", "Bais", "Basay", "Bayawan", "Bindoy", "Dauin", "Dumaguete", "Guihulngan", "Jimalalud", "La Libertad", "Mabinay", "Manjuyod", "Pamplona", "San Jose", "Santa Catalina", "Siaton", "Sibulan", "Tanjay", "Tayasan", "Valencia", "Vallehermoso", "Zamboanguita"], "Siquijor": ["Enrique Villanueva", "Larena", "Lazi", "Maria", "San Juan", "Siquijor"] },
    "Region VIII - Eastern Visayas": { "Biliran": ["Almeria", "Biliran", "Cabucgayan", "Caibiran", "Culaba", "Kawayan", "Maripipi", "Naval"], "Eastern Samar": ["Arteche", "Balangiga", "Balangkayan", "Borongan", "Can-avid", "Dolores", "General MacArthur", "Giporlos", "Guiuan", "Hernani", "Jipapad", "Lawaan", "Llorente", "Maslog", "Maydolong", "Mercedes", "Oras", "Quinapondan", "Salcedo", "San Julian", "San Policarpo", "Sulat", "Taft"], "Leyte": ["Abuyog", "Alangalang", "Albuera", "Babatngon", "Barugo", "Bato", "Baybay", "Burauen", "Calubian", "Capoocan", "Carigara", "Dagami", "Dulag", "Hilongos", "Hindang", "Inopacan", "Isabel", "Jaro", "Javier", "Julita", "Kananga", "La Paz", "Leyte", "MacArthur", "Mahaplag", "Matag-ob", "Matalom", "Mayorga", "Merida", "Ormoc", "Palo", "Palompon", "Pastrana", "San Isidro", "San Miguel", "Santa Fe", "Tabango", "Tabontabon", "Tacloban", "Tanauan", "Tolosa", "Tunga", "Villaba"], "Northern Samar": ["Allen", "Biri", "Bobon", "Capul", "Catarman", "Catubig", "Gamay", "Laoang", "Lapinig", "Las Navas", "Lavezares", "Lope de Vega", "Mapanas", "Mondragon", "Palapag", "Pambujan", "Rosario", "San Antonio", "San Isidro", "San Jose", "San Roque", "San Vicente", "Silvino Lobos", "Victoria"], "Samar": ["Almagro", "Basey", "Calbayog", "Calbiga", "Catbalogan", "Daram", "Gandara", "Hinabangan", "Jiabong", "Marabut", "Matuguinao", "Motiong", "Pagsanghan", "Paranas", "Pinabacdao", "San Jorge", "San Jose de Buan", "San Sebastian", "Santa Margarita", "Santa Rita", "Santo Niño", "Tagapul-an", "Talalora", "Tarangnan", "Villareal", "Zumarraga"], "Southern Leyte": ["Anahawan", "Bontoc", "Hinunangan", "Hinundayan", "Libagon", "Liloan", "Limasawa", "Maasin", "Macrohon", "Malitbog", "Padre Burgos", "Pintuyan", "Saint Bernard", "San Francisco", "San Juan", "San Ricardo", "Silago", "Sogod", "Tomas Oppus"] },
    "Region IX - Zamboanga Peninsula": { "Zamboanga del Norte": ["Baliguian", "Dapitan", "Dipolog", "Godod", "Gutalac", "Jose Dalman", "Kalawit", "Katipunan", "La Libertad", "Labason", "Leon B. Postigo", "Liloy", "Manukan", "Mutia", "Piñan", "Polanco", "President Manuel A. Roxas", "Rizal", "Salug", "Sergio Osmeña Sr.", "Siayan", "Sibuco", "Sibutad", "Sindangan", "Siocon", "Sirawai", "Tampilisan"], "Zamboanga del Sur": ["Aurora", "Bayog", "Dimataling", "Dinas", "Dumalinao", "Dumingag", "Guipos", "Josefina", "Kumalarang", "Labangan", "Lakewood", "Lapuyan", "Mahayag", "Margosatubig", "Midsalip", "Molave", "Pagadian", "Pitogo", "Ramon Magsaysay", "San Miguel", "San Pablo", "Sominot", "Tabina", "Tambulig", "Tigbao", "Tukuran", "Vincenzo A. Sagun", "Zamboanga City"], "Zamboanga Sibugay": ["Alicia", "Buug", "Diplahan", "Imelda", "Ipil", "Kabasalan", "Mabuhay", "Malangas", "Naga", "Olutanga", "Payao", "Roseller T. Lim", "Siay", "Talusan", "Titay", "Tungawan"] },
    "Region X - Northern Mindanao": { "Bukidnon": ["Baungon", "Cabanglasan", "Damulog", "Dangcagan", "Don Carlos", "Impasug-ong", "Kadingilan", "Kalilangan", "Kibawe", "Kitaotao", "Lantapan", "Libona", "Malitbog", "Malaybalay", "Manolo Fortich", "Maramag", "Pangantucan", "Quezon", "San Fernando", "Sumilao", "Talakag", "Valencia"], "Camiguin": ["Catarman", "Guinsiliban", "Mahinog", "Mambajao", "Sagay"], "Lanao del Norte": ["Bacolod", "Baloi", "Baroy", "Iligan", "Kapatagan", "Kauswagan", "Kolambugan", "Lala", "Linamon", "Magsaysay", "Maigo", "Matungao", "Munai", "Nunungan", "Pantao Ragat", "Pantar", "Poona Piagapo", "Salvador", "Sapad", "Sultan Naga Dimaporo", "Tagoloan", "Tangcal", "Tubod"], "Misamis Occidental": ["Aloran", "Baliangao", "Bonifacio", "Calamba", "Clarin", "Concepcion", "Don Victoriano Chiongbian", "Jimenez", "Lopez Jaena", "Oroquieta", "Ozamiz", "Panaon", "Plaridel", "Sapang Dalaga", "Sinacaban", "Tangub", "Tudela"], "Misamis Oriental": ["Alubijid", "Balingasag", "Balingoan", "Binuangan", "Cagayan de Oro", "Claveria", "El Salvador", "Gingoog", "Gitagum", "Initao", "Jasaan", "Kinoguitan", "Lagonglong", "Libertad", "Lugait", "Magsaysay", "Manticao", "Medina", "Naawan", "Opol", "Salay", "Sugbongcogon", "Tagoloan", "Talisayan", "Villanueva"] },
    "Region XI - Davao Region": { "Davao de Oro": ["Compostela", "Laak", "Mabini", "Maco", "Maragusan", "Mawab", "Monkayo", "Montevista", "Nabunturan", "New Bataan", "Pantukan"], "Davao del Norte": ["Asuncion", "Braulio E. Dujali", "Carmen", "Kapalong", "New Corella", "Panabo", "Samal", "San Isidro", "Santo Tomas", "Tagum", "Talaingod"], "Davao del Sur": ["Bansalan", "Davao City", "Digos", "Hagonoy", "Kiblawan", "Magsaysay", "Malalag", "Matanao", "Padada", "Santa Cruz", "Sulop"], "Davao Occidental": ["Don Marcelino", "Jose Abad Santos", "Malita", "Santa Maria", "Sarangani"], "Davao Oriental": ["Baganga", "Banaybanay", "Boston", "Caraga", "Cateel", "Governor Generoso", "Lupon", "Manay", "Mati", "San Isidro", "Tarragona"] },
    "Region XII - SOCCSKSARGEN": { "Cotabato": ["Alamada", "Aleosan", "Antipas", "Arakan", "Banisilan", "Carmen", "Kabacan", "Kidapawan", "Libungan", "Magpet", "Makilala", "Matalam", "Midsayap", "M'lang", "Pigcawayan", "Pikit", "President Roxas", "Tulunan"], "Sarangani": ["Alabel", "Glan", "Kiamba", "Maasim", "Maitum", "Malapatan", "Malungon"], "South Cotabato": ["Banga", "General Santos", "Koronadal", "Lake Sebu", "Norala", "Polomolok", "Santo Niño", "Surallah", "Tampakan", "Tantangan", "T'boli", "Tupi"], "Sultan Kudarat": ["Bagumbayan", "Columbio", "Esperanza", "Isulan", "Kalamansig", "Lambayong", "Lebak", "Lutayan", "Palimbang", "President Quirino", "Senator Ninoy Aquino", "Tacurong"] },
    "Region XIII - Caraga": { "Agusan del Norte": ["Buenavista", "Butuan", "Cabadbaran", "Carmen", "Jabonga", "Kitcharao", "Las Nieves", "Magallanes", "Nasipit", "Remedios T. Romualdez", "Santiago", "Tubay"], "Agusan del Sur": ["Bayugan", "Bunawan", "Esperanza", "La Paz", "Loreto", "Prosperidad", "Rosario", "San Francisco", "San Luis", "Santa Josefa", "Sibagat", "Talacogon", "Trento", "Veruela"], "Dinagat Islands": ["Basilisa", "Cagdianao", "Dinagat", "Libjo", "Loreto", "San Jose", "Tubajon"], "Surigao del Norte": ["Alegria", "Bacuag", "Burgos", "Claver", "Dapa", "Del Carmen", "General Luna", "Gigaquit", "Mainit", "Malimono", "Pilar", "Placer", "San Benito", "San Francisco", "San Isidro", "San Jose", "Santa Monica", "Sison", "Socorro", "Surigao City", "Tagana-an", "Tubod"], "Surigao del Sur": ["Barobo", "Bayabas", "Bislig", "Cagwait", "Cantilan", "Carmen", "Carrascal", "Cortes", "Hinatuan", "Lanuza", "Lianga", "Lingig", "Madrid", "Marihatag", "San Agustin", "San Miguel", "Tagbina", "Tago", "Tandag"] },
    "BARMM": { "Basilan": ["Akbar", "Al-Barka", "Hadji Mohammad Ajul", "Hadji Muhtamad", "Isabela", "Lamitan", "Lantawan", "Maluso", "Sumisip", "Tipo-Tipo", "Tuburan", "Ungkaya Pukan"], "Lanao del Sur": ["Amai Manabilang", "Bacolod-Kalawi", "Balabagan", "Balindong", "Bayang", "Binidayan", "Buadiposo-Buntong", "Bubong", "Butig", "Calanogas", "Ditsaan-Ramain", "Ganassi", "Kapai", "Kapatagan", "Lumba-Bayabao", "Lumbaca-Unayan", "Lumbatan", "Lumbayanague", "Madalum", "Madamba", "Maguing", "Malabang", "Marantao", "Marawi", "Marogong", "Masiu", "Mulondo", "Pagayawan", "Piagapo", "Picong", "Poona Bayabao", "Pualas", "Saguiaran", "Sultan Dumalondong", "Tagoloan II", "Tamparan", "Taraka", "Tubaran", "Tugaya", "Wao"], "Maguindanao del Norte": ["Barira", "Buldon", "Cotabato City", "Datu Blah T. Sinsuat", "Datu Odin Sinsuat", "Kabuntalan", "Matanog", "Northern Kabuntalan", "Parang", "Sultan Kudarat", "Sultan Mastura", "Upi"], "Maguindanao del Sur": ["Ampatuan", "Buluan", "Datu Abdullah Sangki", "Datu Anggal Midtimbang", "Datu Hoffer Ampatuan", "Datu Montawal", "Datu Paglas", "Datu Piang", "Datu Salibo", "Datu Saudi-Ampatuan", "Datu Unsay", "General Salipada K. Pendatun", "Guindulungan", "Mamasapano", "Mangudadatu", "Pagalungan", "Paglat", "Pandag", "Rajah Buayan", "Shariff Aguak", "Shariff Saydona Mustapha", "South Upi", "Sultan sa Barongis", "Sultan Sumagka", "Talayan", "Talitay"], "Sulu": ["Banguingui", "Hadji Panglima Tahil", "Indanan", "Jolo", "Kalingalan Caluang", "Lugus", "Luuk", "Maimbung", "Old Panamao", "Omar", "Pandami", "Panglima Estino", "Pangutaran", "Parang", "Pata", "Patikul", "Siasi", "Talipao", "Tapul", "Tongkil"], "Tawi-Tawi": ["Bongao", "Languyan", "Mapun", "Panglima Sugala", "Sapa-Sapa", "Sibutu", "Simunul", "Sitangkai", "South Ubian", "Tandubas", "Turtle Islands"] }
  };
  const LISTING_FINANCING = [
    ["cash", "Cash"], ["bank", "Bank Financing"], ["inhouse", "In-House / Developer Financing"],
    ["pagibig", "Pag-IBIG"], ["developer", "Developer Terms"]
  ];
  const LISTING_SORTS = [
    ["newest", "Newest"], ["price-asc", "Price: Low → High"], ["price-desc", "Price: High → Low"],
    ["area-desc", "Area: Largest"], ["price-sqm-asc", "₱/sqm: Low → High"]
  ];

  /* ================= ICONS ================= */
  const ICONS = {
    dashboard: '<path d="M3 3h8v10H3zM13 3h8v6h-8zM13 13h8v8h-8zM3 17h8v4H3z"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>',
    chat: '<path d="M21 12a8 8 0 01-8 8H4l-1 3 3-3a8 8 0 1115-8z"/>',
    bell: '<path d="M18 9a6 6 0 10-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15 18 9z"/><path d="M10 20a2 2 0 004 0"/>',
    file: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 9v11a1 1 0 001 1h12a1 1 0 001-1V9"/>',
    pin: '<path d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    dollar: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12M9 9.5h5M9.5 14.5H14"/>',
    trending: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    download: '<path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    spark: '<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/>',
    scale: '<path d="M12 3v18M5 7h14"/><path d="M6 7L3 13h6zM18 7l-3 6h6zM8 21h8"/>',
    shield: '<path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z"/>',
    zap: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    doc: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    refresh: '<path d="M21 12a9 9 0 11-2.6-6.4"/><path d="M21 3v6h-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2v-9a2 2 0 012-2z"/><circle cx="12" cy="13" r="4"/>',
    print: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v7H6z"/>',
    star: '<path d="M12 3l2.7 5.5 6 .9-4.4 4.3 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.4l6-.9z"/>',
    archive: '<path d="M4 7h16M6 7v13a1 1 0 001 1h10a1 1 0 001-1V7"/><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"/><path d="M12 11v4M10 13l2 2 2-2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
    phone: '<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 2 .7 2.9a2 2 0 01-.5 2.1L8 10a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.9.6 2.9.7a2 2 0 011.7 2z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
    key: '<circle cx="7.5" cy="15.5" r="5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3M18.4 4.6l2 2"/>',
    link: '<path d="M10 14a5 5 0 007.1.1l3-3a5 5 0 00-7.1-7.1l-1.7 1.7"/><path d="M14 10a5 5 0 00-7.1-.1l-3 3a5 5 0 007.1 7.1l1.7-1.7"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.5M8.2 13.2l7.6 4.5"/>',
    upload: '<path d="M12 16V4m0 0l-4 4m4-4l4 4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.08a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.08a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.08a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>'
  };
  function icon(name, size) {
    return '<svg viewBox="0 0 24 24" style="width:' + (size || 16) + 'px;height:' + (size || 16) + 'px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.check) + '</svg>';
  }
  function fillIcons() {
    $$("[data-ic]").forEach(s => { s.innerHTML = icon(s.getAttribute("data-ic"), 16); });
  }

  /* ================= STATE ================= */
  const KEY = "esrealty_v1";
  const AUTH_KEY = "esrealty_user";
  let state = null;
  let currentUser = null;
  let remoteSaveTimer = null;
  let pmsSaveTimer = null;
  let remoteProfiles = [];
  let remoteProfilesLoaded = false;
  let remoteProfilesLoading = false;
  let remoteProfilesError = "";
  let remoteProfilesFailed = false;
  let cloudAccountSaving = false;
  let passwordResetRequests = [];
  let passwordResetsLoaded = false;
  let demoResetRequests = [];
  let pmsCreatedPassword = "";
  let lsCarIndex = 0;

  function temporaryPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$";
    const bytes = new Uint8Array(14);
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error("Secure password generation is unavailable");
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => chars[b % chars.length]).join("");
  }

  function defaultState() {
    return { deals: [], current: null, view: "dashboard", wizardStep: 1, theme: "light", dealTab: "overview", appraisal: null, appraisalTab: "setup", appraisals: [], market: null, pms: { properties: [], units: [], owners: [], tenants: [], leases: [], payments: [], maintenance: [], expenses: [], documents: [] }, pmsTab: "properties", listings: [], favorites: [], listingFilters: {}, listingDetail: null, leads: [], leadFilters: {}, leadDetail: null, leadMode: "pipeline", leadCalendarMonth: "", lang: "en", users: [], transactions: [], financingScenarios: [], financingDraft: null, salesPlaybooks: [], playbookFilters: { q: "", stage: "", category: "", propertyType: "", status: "" }, commission: { settings: { grossPct: 3, brokerShare: 40, agentShare: 50, referralShare: 10 }, payouts: [] }, docVault: [], siteVisits: [], campaigns: [], listingStats: {}, siteContact: { eyebrow: "TALK TO A SHOPHOUSE SPECIALIST", title: "Ready to put the ground floor to work?", description: "Tell us your province, budget, and business plan. A shophouse specialist from ES Realty will reply within one business day with listings and next steps.", phone: "+63 900 000 0000", email: "hello@esrealty.ph", address: "Batangas, Philippines", hours: "Monday–Saturday, 9:00 AM–6:00 PM" }, adminTab: "overview", txDetail: null, usersTab: "pending" };
  }
  function loadState() {
    if (!IS_LOCAL_DEV) return defaultState();
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.deals)) return Object.assign(defaultState(), s);
    } catch (e) {}
    return defaultState();
  }
  function save() {
    if (state.appraisal && state.appraisal.name && state.appraisal.name.trim()) {
      const a = state.appraisal;
      const existing = state.appraisals.findIndex(x => x.id === a.id);
      if (existing >= 0) state.appraisals[existing] = a; else state.appraisals.unshift(a);
    }
    if (IS_LOCAL_DEV && !(currentUser && currentUser.id)) {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("Local draft could not be saved", "err"); }
      return;
    }
    if (!SB || !currentUser || !currentUser.id) return;
    const ownerId = currentUser.id;
    const payload = JSON.parse(JSON.stringify(state));
    delete payload.salesPlaybooks;
    clearTimeout(remoteSaveTimer);
    remoteSaveTimer = setTimeout(async () => {
      if (!currentUser || currentUser.id !== ownerId) return;
      const { error } = await SB.from("app_state").upsert({ owner_id: ownerId, payload: payload }, { onConflict: "owner_id" });
      if (error) toast("Cloud save failed: " + esc(error.message), "err");
    }, 500);
    schedulePmsCloudSave();
  }

  function schedulePmsCloudSave() {
    if (!SB || !currentUser || !currentUser.id || currentUser.role !== "super-admin") return;
    const ownerId = currentUser.id;
    const payload = JSON.parse(JSON.stringify(pms()));
    clearTimeout(pmsSaveTimer);
    pmsSaveTimer = setTimeout(async () => {
      if (!currentUser || currentUser.id !== ownerId || currentUser.role !== "super-admin") return;
      const { error } = await SB.from("pms_workspaces").upsert({ owner_id: ownerId, payload: payload }, { onConflict: "owner_id" });
      if (error && !/pms_workspaces|schema cache|does not exist/i.test(String(error.message || ""))) toast("Property Management save failed: " + esc(error.message), "err");
    }, 550);
  }

  async function loadCloudPms() {
    if (!SB || !currentUser || !currentUser.id) return false;
    let query = SB.from("pms_workspaces").select("owner_id, payload");
    if (currentUser.role === "super-admin") query = query.eq("owner_id", currentUser.id);
    const result = await query.limit(1).maybeSingle();
    if (result.error) {
      if (!/pms_workspaces|schema cache|does not exist/i.test(String(result.error.message || ""))) throw result.error;
      return false;
    }
    if (result.data && result.data.payload && typeof result.data.payload === "object") {
      state.pms = Object.assign(defaultState().pms, result.data.payload);
      return true;
    }
    if (currentUser.role === "super-admin") schedulePmsCloudSave();
    return false;
  }

  async function loadCurrentUserCloudState() {
    if (!SB || !currentUser || !currentUser.id) return;
    const { data: cloudState, error } = await SB.from("app_state").select("payload").eq("owner_id", currentUser.id).maybeSingle();
    if (error) throw error;
    if (cloudState && cloudState.payload && typeof cloudState.payload === "object") state = Object.assign(defaultState(), cloudState.payload);
    else state = defaultState();
    state.listingFilters = {};
    state.listingDetail = null;
    await loadCloudPms();
  }

  function loadUser() {
    if (!IS_LOCAL_DEV) return null;
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; }
  }
  function saveUser(u) { if (IS_LOCAL_DEV) { try { localStorage.setItem(AUTH_KEY, JSON.stringify(u)); } catch (e) {} } }
  async function loadSupabaseProfile(user) {
    let cols = "id, full_name, role, registration_status, agency, prc, resa, phone, broker";
    let { data, error } = await SB.from("profiles").select(cols).eq("id", user.id).maybeSingle();
    if (error && (String(error.message || "").indexOf("does not exist") >= 0 || String(error.message || "").indexOf("schema cache") >= 0 || String(error.message || "").indexOf("querying schema") >= 0 || String(error.message || "").indexOf("column of") >= 0)) {
      cols = "id, full_name, role, registration_status";
      const r = await SB.from("profiles").select(cols).eq("id", user.id).maybeSingle();
      data = r.data; error = r.error;
    }
    if (!error && !data) {
      const repaired = await SB.rpc("ensure_my_profile");
      if (repaired.error) throw repaired.error;
      data = repaired.data;
    }
    if (error) throw error;
    if (!data) throw new Error("Your account profile could not be created");
    return { id: user.id, email: user.email, name: data.full_name || user.email, role: data.role, brokerId: data.broker || null, registrationStatus: data.registration_status || "pending", agency: data.agency || "", prc: data.prc || "", resa: data.resa || "", phone: data.phone || "", mustChangePassword: !!(user.user_metadata && user.user_metadata.must_change_password) };
  }
  async function requireApprovedProfile(profile) {
    if (profile.registrationStatus === "approved") return true;
    currentUser = null;
    await SB.auth.signOut();
    const status = profile.registrationStatus === "rejected" ? "rejected" : "pending Super Admin approval";
    throw new Error("Your registration is " + status + ".");
  }
  function firstAllowedView() {
    if (currentUser && currentUser.role === "owner" && navAllowed("pms")) return "pms";
    if (currentUser && currentUser.role === "tenant" && navAllowed("pms")) return "pms";
    if (currentUser && currentUser.role === "buyer" && navAllowed("portal")) return "portal";
    const views = ["dashboard", "wizard", "deal", "appraisal", "market", "leads", "listings", "portfolio", "pms", "assistant", "reports", "transactions", "financing", "playbook", "users", "admin", "settings"];
    return views.find(navAllowed) || "listings";
  }
  function applyPostLoginView() {
    if (currentUser && currentUser.mustChangePassword && navAllowed("settings")) state.view = "settings";
    else if (!navAllowed(state.view)) state.view = firstAllowedView();
  }
  async function completePostAuthIntent() {
    const favoriteId = sessionStorage.getItem("esrealty_post_auth_favorite") || "";
    if (!favoriteId || !LISTINGS_API || !currentUser || !currentUser.id) return;
    sessionStorage.removeItem("esrealty_post_auth_favorite");
    try {
      if ((state.favorites || []).indexOf(favoriteId) < 0) {
        const result = await LISTINGS_API.toggleFavorite(favoriteId);
        if (result.saved) state.favorites.push(favoriteId);
      }
      if (navAllowed("dashboard")) state.view = "dashboard";
      toast("Property saved to your dashboard");
    } catch (e) { toast("Signed in, but the property could not be saved: " + esc(friendlyErr(e.message)), "err"); }
  }
  /* ================= PRE-SELLING INVENTORY ================= */
  function psScheduleRows(unitId) {
    return (state.presellPayments || []).filter(p => p.unit_id === unitId).slice().sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")));
  }
  function psOpenSchedule(unitId) {
    const u = (state.presellUnits || []).find(x => x.id === unitId);
    if (!u) return;
    psModal("Payment Schedule — Unit " + (u.unit_no || ""),
      '<div id="ps-sched-body">' + psScheduleBody(unitId) + "</div>",
      "Close");
    const saveBtn = document.querySelector("#ps-modal [data-ps-save]");
    if (saveBtn) { saveBtn.setAttribute("data-ps-close", "1"); saveBtn.textContent = "Close"; }
  }
  function psScheduleBody(unitId) {
    const rows = psScheduleRows(unitId);
    let body = "";
    if (!rows.length) {
      body = '<p class="dim">No schedule generated yet for this unit.</p>';
    } else {
      let paid = 0, outstanding = 0;
      rows.forEach(r => { const a = Number(r.amount || 0); if (r.status === "paid") paid += a; else if (r.status !== "waived") outstanding += a; });
      body = '<div class="table-wrap"><table class="data"><tr><th>Due</th><th>Label</th><th class="num">Amount</th><th>Status</th><th></th></tr>';
      rows.forEach(r => {
        const canPay = managePresell() && r.status === "pending";
        body += "<tr><td>" + esc(String(r.due_date || "").slice(0, 10)) + "</td><td>" + esc(r.label || "-") + '</td><td class="num">' + C.money(Number(r.amount || 0)) + "</td><td>" + psStatusBadge(r.status === "pending" && String(r.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10) ? "late" : r.status) + "</td><td>" +
          (canPay ? '<button class="btn btn-ghost btn-sm" data-ps-pay="' + esc(r.id) + '">Mark Paid</button>' : "") + "</td></tr>";
      });
      body += '<tr><td colspan="2"><b>Totals</b></td><td colspan="3"></td></tr>';
      body += "</table></div>";
      body += '<div class="row mt-8" style="gap:16px"><span>Paid: <b>' + C.money(paid) + "</b></span><span>Outstanding: <b>" + C.money(outstanding) + "</b></span>" + (managePresell() ? '<button class="btn btn-ghost btn-sm ml-auto" data-ps-regen="' + esc(unitId) + '">Regenerate Schedule</button>' : "") + "</div>";
    }
    if (managePresell()) {
      body = '<div class="grid grid-2 mb-16">' +
        psField("Total contract price", psText("psf-tcp", u2val(unitId, "total_contract_price") || "", "", "number")) +
        psField("Reservation fee", psText("psf-resfee", u2val(unitId, "reservation_fee") || "0", "", "number")) +
        psField("Equity months", psText("psf-dpmonths", u2val(unitId, "downpayment_months") || "24", "", "number")) +
        psField("Loan %", psText("psf-loanpct", u2val(unitId, "loan_percent") != null ? u2val(unitId, "loan_percent") : "90", "", "number")) +
        psField("Loan rate (% p.a.)", psText("psf-rate", u2val(unitId, "loan_rate_annual") != null ? u2val(unitId, "loan_rate_annual") : "7.5", "", "number")) +
        psField("Loan term (years)", psText("psf-years", u2val(unitId, "loan_term_years") || "15", "", "number")) +
        psField("Bank take-out start", psText("psf-loanstart", u2val(unitId, "loan_start_date") || "", "", "date")) +
        "</div>" +
        '<button class="btn btn-primary btn-sm" data-ps-gen="' + esc(unitId) + '">Generate / Update Schedule</button><hr style="margin:14px 0;border:none;border-top:1px solid var(--stroke)">' + body;
    }
    return body;
  }
  function u2val(unitId, key) {
    const u = (state.presellUnits || []).find(x => x.id === unitId);
    return u ? u[key] : null;
  }
  function managePresell() { return roleIs("super-admin"); }
  async function psMarkPaid(paymentId) {
    const row = (state.presellPayments || []).find(x => x.id === paymentId);
    if (!row) return;
    row.status = "paid"; row.paid_at = new Date().toISOString().slice(0, 10); row.method = "Manual";
    save(); render();
    const open = document.getElementById("ps-sched-body");
    if (open) open.innerHTML = psScheduleBody(row.unit_id);
    if (psCloud()) {
      const r = await SB.from("presell_payments").update({ status: "paid", paid_at: row.paid_at, method: "Manual" }).eq("id", paymentId);
      if (r.error) toast("Cloud update failed: " + esc(friendlyErr(r.error.message)), "err");
    }
  }
  async function psGenerateSchedule(unitId, collectInputs) {
    const u = (state.presellUnits || []).find(x => x.id === unitId);
    if (!u) return;
    if (collectInputs) {
      const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
      Object.assign(u, {
        total_contract_price: Number(g("psf-tcp")) || Number(u.price || 0),
        reservation_fee: Number(g("psf-resfee")) || 0,
        downpayment_months: Math.max(1, parseInt(g("psf-dpmonths"), 10) || 24),
        loan_percent: Number(g("psf-loanpct")), 
        loan_rate_annual: Number(g("psf-rate")),
        loan_term_years: Math.max(0, parseInt(g("psf-years"), 10) || 15),
        loan_start_date: g("psf-loanstart") || null
      });
      save();
    }
    if (!Number(u.total_contract_price || 0) && !Number(u.price)) { toast("Set total contract price first", "err"); return; }
    if (psCloud()) {
      try {
        const r = await SB.rpc("generate_presell_schedule", { p_unit: unitId });
        if (r.error) throw r.error;
        const pay = await SB.from("presell_payments").select("*").eq("unit_id", unitId);
        state.presellPayments = (state.presellPayments || []).filter(x => x.unit_id !== unitId).concat(pay.data || []);
        toast("Schedule generated (" + (r.data || 0) + " rows added)");
        render();
        const body = document.getElementById("ps-sched-body");
        if (body) body.innerHTML = psScheduleBody(unitId);
      } catch (e) { toast("Could not generate schedule: " + esc(friendlyErr(e.message)), "err"); }
      return;
    }
    // local generator (demo)
    const tcp = Number(u.total_contract_price || u.price || 0);
    if (!state.presellPayments) state.presellPayments = [];
    state.presellPayments = state.presellPayments.filter(p => !(p.unit_id === unitId && p.status === "pending"));
    let created = 0;
    const addRow = (due, label, amount, status) => {
      if ((state.presellPayments || []).some(p => p.unit_id === unitId && String(p.label || "").toLowerCase() === label.toLowerCase())) return;
      state.presellPayments.push({ id: "ppay-" + Date.now() + "-" + Math.floor(Math.random() * 999), unit_id: unitId, due_date: due, label: label, amount: amount, status: status || "pending", paid_at: status === "paid" ? due : null, notes: "" });
      created++;
    };
    const resFee = Number(u.reservation_fee || 0);
    if (!(state.presellPayments.some(p => p.unit_id === unitId && /reservation/i.test(p.label || "")))) addRow(String(u.reserved_at || "").slice(0, 10) || new Date().toISOString().slice(0, 10), "Reservation Fee", resFee, "paid");
    const months = Math.max(parseInt(u.downpayment_months, 10) || 24, 1);
    const eqTotal = tcp * (100 - Number(u.loan_percent)) / 100;
    const eqMonthly = Math.round(eqTotal / months * 100) / 100;
    let d = u.reserved_at ? new Date(u.reserved_at.slice(0, 10) + "T00:00:00") : new Date();
    d.setMonth(d.getMonth() + 1);
    for (let i = 1; i <= months; i++) {
      const iso = d.toISOString().slice(0, 10);
      addRow(iso, "Equity " + i + " of " + months, eqMonthly, "pending");
      d.setMonth(d.getMonth() + 1);
    }
    const m = Math.max(parseInt(u.loan_term_years, 10) || 15, 0) * 12;
    if (Number(u.loan_percent) > 0 && u.loan_start_date && m > 0) {
      const principal = tcp * Number(u.loan_percent) / 100;
      const rr = Number(u.loan_rate_annual) / 100 / 12;
      const amort = Math.round(principal * rr / (1 - Math.pow(1 + rr, -m)) * 100) / 100;
      const ld = new Date(u.loan_start_date + "T00:00:00");
      for (let i = 1; i <= m; i++) {
        const iso = ld.toISOString().slice(0, 10);
        addRow(iso, "Amortization " + i + " of " + m, amort, "pending");
        ld.setMonth(ld.getMonth() + 1);
      }
    }
    save(); render(); toast("Schedule generated (" + created + " rows)");
    const bodyEl = document.getElementById("ps-sched-body");
    if (bodyEl) bodyEl.innerHTML = psScheduleBody(unitId);
  }

  let psBound = false;
  function psEnsure() {
    if (!Array.isArray(state.presellProjects)) state.presellProjects = [];
    if (!Array.isArray(state.presellUnits)) state.presellUnits = [];
    if (!Array.isArray(state.presellPayments)) state.presellPayments = [];
  }
  function psCloud() { return !!(SB && currentUser && currentUser.id && !currentUser.demo && currentUser.registrationStatus === "approved"); }
  function seedPresellSample() {
    psEnsure();
    const today = new Date();
    if (!state.presellProjects.length) {
      state.presellProjects.push({ id: "psp-seed-1", name: "Solstice Residences", developer: "Villanueva Land Corp.", location: "Bacoor, Cavite", lts_no: "LTS-0324-001", turnover_date: "2027-12-31", description: "Mid-rise condo community near CALAX exit.", status: "active" });
      state.presellProjects.push({ id: "psp-seed-2", name: "Harbor Row Shophouses", developer: "ES Realty Development", location: "Davao City", lts_no: "LTS-0325-014", turnover_date: "2026-12-31", description: "Three-storey commercial shophouse strip.", status: "active" });
    }
    if (!state.presellUnits.length) {
      const mk = (pid, no, tw, fl, ty, pr, st, rf) => ({ id: "psu-" + pid + "-" + no, project_id: pid, unit_no: no, tower: tw, floor: fl, unit_type: ty, price: pr, status: st, reserved_for: rf || "", reserved_at: st === "reserved" ? today.toISOString() : null, notes: "" });
      state.presellUnits.push(
        mk("psp-seed-1", "1205", "A", 12, "Studio", 2800000, "sold", "K. Reyes"),
        mk("psp-seed-1", "1206", "A", 12, "Studio", 2850000, "reserved", "M. Dizon"),
        mk("psp-seed-1", "1207", "A", 12, "1BR", 4100000, "available"),
        mk("psp-seed-1", "2101", "B", 10, "2BR", 6300000, "available"),
        mk("psp-seed-2", "SH-01", "", 1, "Commercial", 12500000, "available"),
        mk("psp-seed-2", "SH-02", "", 1, "Commercial", 12500000, "reserved", "L. Tan")
      );
      if (!Array.isArray(state.presellPayments)) state.presellPayments = [];
      if (!state.presellPayments.length) {
        const pd = m => { const x = new Date(); x.setMonth(x.getMonth() + m); return x.toISOString().slice(0, 10); };
        const mkp = (uid, due, label, amount, status) => ({ id: "ppay-" + label.replace(/[^A-Za-z0-9]+/g, "") + uid.slice(-4), unit_id: uid, due_date: due, label: label, amount: amount, status: status, paid_at: status === "paid" ? due : "", notes: "" });
        state.presellPayments.push(
          mkp("psu-psp-seed-1-1206", pd(0), "Equity 1 of 24", 95000, "paid"),
          mkp("psu-psp-seed-1-1206", pd(1), "Equity 2 of 24", 95000, "pending"),
          mkp("psu-psp-seed-1-1206", pd(2), "Equity 3 of 24", 95000, "pending")
        );
      }
    }
  }
  async function psLoadFromCloud(force) {
    if (!psCloud()) return;
    try {
      const pr = await SB.from("presell_projects").select("*").order("created_at", { ascending: false });
      if (pr.error) throw pr.error;
      const un = await SB.from("presell_units").select("*").order("unit_no");
      if (un.error) throw un.error;
      state.presellProjects = pr.data || [];
      state.presellUnits = un.data || [];
      try { const py = await SB.from("presell_payments").select("*").order("due_date"); if (!py.error) state.presellPayments = py.data || []; } catch (pyErr) {}
      save();
    } catch (e) { toast("Could not load pre-selling inventory: " + esc(friendlyErr(e.message)), "err"); }
  }
  function psProject(id) { return (state.presellProjects || []).find(p => p.id === id); }
  function psUnitCounts(pid) {
    const u = (state.presellUnits || []).filter(x => x.project_id === pid);
    return { total: u.length, available: u.filter(x => x.status === "available").length, reserved: u.filter(x => x.status === "reserved").length, sold: u.filter(x => x.status === "sold").length };
  }
  const PS_UNIT_TYPES = [["Studio", "Studio"], ["1BR", "1-Bedroom"], ["2BR", "2-Bedroom"], ["3BR", "3-Bedroom"], ["Penthouse", "Penthouse"], ["Commercial", "Commercial / Shophouse"]];
  function psStatusBadge(s) {
    const m = { available: ["Available", "green"], reserved: ["Reserved", "gold"], sold: ["Sold", "red"], blocked: ["Blocked", "blue"] };
    const c = m[s] || [s || "-", "blue"];
    return '<span class="badge ' + c[1] + '">' + esc(c[0]) + "</span>";
  }
  function psModal(title, bodyHtml, onSaveLabel) {
    closePsModal();
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "ps-modal";
    ov.innerHTML = '<div class="modal-card"><div class="modal-head"><h3>' + esc(title) + '</h3><button class="icon-btn" data-ps-cancel title="Close">&times;</button></div><div class="modal-body">' + bodyHtml + '</div><div class="modal-foot"><button class="btn btn-ghost" data-ps-cancel>Cancel</button><button class="btn btn-primary" data-ps-save>' + esc(onSaveLabel || "Save") + "</button></div></div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", ev => { if (ev.target === ov) closePsModal(); });
  }
  function closePsModal() { const m = document.getElementById("ps-modal"); if (m) m.remove(); }
  function psField(label, inner) { return '<label class="field"><span>' + esc(label) + "</span>" + inner + "</label>"; }
  function psText(id, val, ph, type) { return '<input class="input" id="' + id + '" type="' + (type || "text") + '" value="' + esc(val == null ? "" : val) + '" placeholder="' + esc(ph || "") + '">'; }
  function psSelect(id, opts, cur) {
    return '<select class="input" id="' + id + '">' + opts.map(o => { const v = Array.isArray(o) ? o[0] : o; const l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select>";
  }
  function psOpenProjectEditor(id) {
    const rec = id ? psProject(id) : null;
    psModal(rec ? "Edit Project" : "New Pre-Selling Project",
      '<div class="grid grid-2">' +
      psField("Project name *", psText("psf-name", rec ? rec.name : "", "e.g. Solstice Residences")) +
      psField("Developer", psText("psf-dev", rec ? rec.developer : "")) +
      psField("Location", psText("psf-loc", rec ? rec.location : "", "City, Province")) +
      psField("DHSUD LTS No.", psText("psf-lts", rec ? rec.lts_no : "", "Required on ads")) +
      psField("Turnover date", psText("psf-turnover", rec ? rec.turnover_date : "", "YYYY-MM-DD", "date")) +
      psField("Status", psSelect("psf-status", [["active", "Pre-selling"], ["ready_for_occupancy", "Ready for Occupancy"], ["sold_out", "Sold Out"], ["archived", "Archived"]], rec ? rec.status : "active")) +
      "</div>" +
      psField("Description", '<textarea class="input" id="psf-desc" rows="2">' + esc(rec ? rec.description : "") + "</textarea>") ,
      rec ? "Save Changes" : "Create Project");
    const saveBtn = document.querySelector("#ps-modal [data-ps-save]");
    if (saveBtn) saveBtn.setAttribute("data-ps-save-project", id || "");
  }
  function psOpenUnitEditor(projectId, id) {
    const rec = id ? (state.presellUnits || []).find(u => u.id === id) : null;
    psModal(rec ? "Edit Unit" : "Add Unit",
      '<div class="grid grid-2">' +
      psField("Unit no. *", psText("psf-unit-no", rec ? rec.unit_no : "", "e.g. 1205")) +
      psField("Tower / Building", psText("psf-unit-tower", rec ? rec.tower : "", "e.g. A")) +
      psField("Floor", psText("psf-unit-floor", rec ? rec.floor : "", "", "number")) +
      psField("Unit type", psSelect("psf-unit-type", PS_UNIT_TYPES, rec ? rec.unit_type : "")) +
      psField("Price (PHP)", psText("psf-unit-price", rec ? rec.price : "", "", "number")) +
      psField("Notes", psText("psf-unit-notes", rec ? rec.notes : "")) +
      "</div>",
      rec ? "Save Changes" : "Add Unit");
    const saveBtn = document.querySelector("#ps-modal [data-ps-save]");
    if (saveBtn) saveBtn.setAttribute("data-ps-save-unit", (rec ? rec.id : "") + "|" + projectId);
  }
  function psOpenReserve(unitId) {
    const u = (state.presellUnits || []).find(x => x.id === unitId);
    if (!u) return;
    psModal("Reserve Unit " + u.unit_no,
      psField("Client name *", psText("psf-res-name", u.reserved_for || "")) +
      psField("Client account email (optional - links their Buyer Portal)", psText("psf-res-email", "", "buyer@email.com")),
      "Reserve Unit");
    const saveBtn = document.querySelector("#ps-modal [data-ps-save]");
    if (saveBtn) saveBtn.setAttribute("data-ps-reserve", unitId);
  }
  function psCanManage() { return roleIs("super-admin"); }
  function renderPresell() {
    psEnsure();
    const manage = psCanManage();
    if (!state.presellProjects.length && !state.presellUnits.length && !psCloud()) seedPresellSample();
    const pid = state.psProjectId || "";
    if (pid && !psProject(pid)) state.psProjectId = "";
    return state.psProjectId ? psDetailView(manage) : psListView(manage);
  }
  function psListView(manage) {
    const active = state.presellProjects.filter(p => p.status !== "archived");
    const counts = psUnitCountsAll();
    let html = '<div class="hero"><div><h1>Pre-Selling Projects</h1><p>Inventory matrix for pre-selling developments - track every unit from available to sold.</p></div>' +
      (manage ? '<div class="actions"><button class="btn btn-primary" data-ps-new-project>' + icon("plus", 15) + " New Project</button></div>" : "") + "</div>";
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Projects", active.length, "in pipeline", "green", "briefcase") +
      kpi("Total Units", counts.total, "across projects", "blue", "layers") +
      kpi("Available", counts.available, "open for reservation", "green", "check") +
      kpi("Reserved / Sold", counts.reserved + counts.sold, counts.reserved + " reserved · " + counts.sold + " sold", "gold", "doc") + "</div>";
    if (!active.length) {
      html += '<div class="card card-pad empty">' + icon("layers", 40) + "<h3>No pre-selling projects yet</h3><p>Create your first project to start tracking its unit inventory.</p></div>";
      return html;
    }
    html += '<div class="grid grid-2">';
    active.forEach(p => {
      const c = counts.byProject[p.id] || { total: 0, available: 0, reserved: 0, sold: 0 };
      html += '<article class="card card-pad"><div class="row spread"><h3 style="margin:0">' + esc(p.name) + "</h3>" + psStatusBadge(p.status === "sold_out" ? "sold" : p.status === "archived" ? "blocked" : "available") + "</div>" +
        '<p class="dim tiny mt-8">' + esc(p.developer || "-") + " · " + esc(p.location || "-") + "</p>" +
        (p.lts_no ? '<p class="tiny mt-4"><span class="badge blue">LTS ' + esc(p.lts_no) + "</span></p>" : "") +
        '<div class="row mt-8 dim tiny">' + c.total + " units · " + c.available + " available · " + c.reserved + " reserved · " + c.sold + " sold</div>" +
        '<div class="row mt-16" style="gap:8px"><button class="btn btn-primary btn-sm" data-ps-open="' + esc(p.id) + '\">Open Inventory</button>' +
        (manage ? '<button class="btn btn-ghost btn-sm" data-ps-edit-project="' + esc(p.id) + '\">Edit</button><button class="btn btn-danger btn-sm" data-ps-archive-project="' + esc(p.id) + '\">Archive</button>' : "") +
        "</div></article>";
    });
    html += "</div>";
    return html;
  }
  function psUnitCountsAll() {
    const out = { total: 0, available: 0, reserved: 0, sold: 0, byProject: {} };
    (state.presellUnits || []).forEach(u => {
      out.total++;
      if (out[u.status] != null) out[u.status]++;
      out.byProject[u.project_id] = out.byProject[u.project_id] || { total: 0, available: 0, reserved: 0, sold: 0 };
      const b = out.byProject[u.project_id];
      b.total++;
      if (b[u.status] != null) b[u.status]++;
    });
    return out;
  }
  function psDetailView(manage) {
    const proj = psProject(state.psProjectId);
    if (!proj) return psListView(manage);
    const q = String(state.psQuery || "").toLowerCase();
    const sf = state.psStatusFilter || "";
    let units = (state.presellUnits || []).filter(u => u.project_id === proj.id);
    if (sf) units = units.filter(u => u.status === sf);
    if (q) units = units.filter(u => ((u.unit_no || "") + " " + (u.tower || "") + " " + (u.unit_type || "") + " " + (u.reserved_for || "")).toLowerCase().indexOf(q) !== -1);
    const c = psUnitCounts(proj.id);
    let html = '<div class="hero"><div><button class="btn btn-ghost btn-sm mb-8" data-ps-back>&larr; All Projects</button><h1>' + esc(proj.name) + "</h1><p>" + esc(proj.developer || "") + (proj.lts_no ? " · LTS " + esc(proj.lts_no) : "") + (proj.turnover_date ? " · Turnover " + esc(String(proj.turnover_date).slice(0, 10)) : "") + "</p></div>" +
      (manage ? '<div class="actions"><button class="btn btn-primary" data-ps-add-unit="' + esc(proj.id) + '">' + icon("plus", 15) + " Add Unit</button></div>" : "") + "</div>";
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Total Units", c.total, "in this project", "blue", "layers") +
      kpi("Available", c.available, "open for reservation", "green", "check") +
      kpi("Reserved", c.reserved, "awaiting completion", "gold", "doc") +
      kpi("Sold", c.sold, "closed units", "red", "dollar") + "</div>";
    html += '<section class="card pb-filter"><label>Search<input class="input" id="ps-q" value="' + esc(state.psQuery || "") + '" placeholder="Unit, tower, client..."></label><label>Status<select class="input" id="ps-sf">' + psSelect("_x", [["", "All statuses"], ["available", "Available"], ["reserved", "Reserved"], ["sold", "Sold"], ["blocked", "Blocked"]], sf).replace(/^<select[^>]*>|<\/select>$/g, "") + "</select></label></section>";
    if (!units.length) {
      html += '<div class="card card-pad empty">' + icon("layers", 36) + "<h3>No units match</h3><p>Add units or adjust the filters.</p></div>";
      return html;
    }
    html += '<div class="card card-pad"><div class="table-wrap"><table class="data"><tr><th>Unit</th><th>Tower</th><th>Floor</th><th>Type</th><th class="num">Price</th><th>Status</th>' + "<th>Actions</th>" + (manage ? "<th>Client</th>" : "") + "</tr>";
    units.slice().sort((a, b) => String(a.unit_no).localeCompare(String(b.unit_no))).forEach(u => {
      html += '<tr><td><b>' + esc(u.unit_no) + "</b></td><td>" + esc(u.tower || "-") + "</td><td>" + esc(u.floor == null ? "-" : u.floor) + "</td><td>" + esc(u.unit_type || "-") + "</td><td class=\"num\">" + (Number(u.price) > 0 ? C.money(Number(u.price)) : "-") + "</td><td>" + psStatusBadge(u.status) + "</td>";
      if (manage) {
        html += "<td>" + esc(u.reserved_for || "-") + "</td>";
      }
        html += '<td><div class="row" style="gap:6px">';
        if (roleIs("buyer") && u.status === "available") {
          html += '<button class="btn btn-primary btn-sm" data-ps-self-reserve="' + esc(u.id) + '">Reserve This Unit</button>';
        }
        if (manage) {
          html += '<button class="btn btn-ghost btn-sm" data-ps-reserve-btn="' + esc(u.id) + '">Reserve</button>';
          html += '<button class="btn btn-ghost btn-sm" data-ps-mark="' + esc(u.id) + ':sold">Sold</button>';
          html += '<button class="btn btn-ghost btn-sm" data-ps-mark="' + esc(u.id) + ':available">Release</button>';
        html += '<button class=\"icon-btn btn-sm\" data-ps-edit-unit=\"' + esc(u.id) + '\" title=\"Edit\">' + icon("edit", 13) + "</button>";
        }
        html += '<button class="btn btn-ghost btn-sm" data-ps-sched="' + esc(u.id) + '">Schedule</button>';
        html += "</div></td>";
      html += "</tr>";
    });
    html += "</table></div></div>";
    return html;
  }
  async function psSaveProject(editId) {
    const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const name = g("psf-name");
    if (!name) { toast("Project name is required", "err"); return; }
    const payload = { name: name, developer: g("psf-dev"), location: g("psf-loc"), lts_no: g("psf-lts"), turnover_date: g("psf-turnover") || null, status: g("psf-status") || "active", description: g("psf-desc") };
    closePsModal();
    if (editId) {
      Object.assign(psProject(editId) || {}, payload);
      if (psCloud()) { const r = await SB.from("presell_projects").update(payload).eq("id", editId); if (r.error) toast("Cloud update failed: " + esc(friendlyErr(r.error.message)), "err"); }
      toast("Project updated");
    } else {
      const rec = Object.assign({ id: "psp-" + Date.now(), created_at: new Date().toISOString() }, payload);
      state.presellProjects.unshift(rec);
      if (psCloud()) { delete rec.id; const r = await SB.from("presell_projects").insert(payload).select("*").single(); if (r.error) { toast("Cloud save failed: " + esc(friendlyErr(r.error.message)), "err"); } else { Object.assign(rec, r.data); rec._localId = undefined; } }
      toast("Project created");
    }
    save(); render();
  }
  async function psSaveUnit(editId, projectId) {
    const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const unitNo = g("psf-unit-no");
    if (!unitNo) { toast("Unit number is required", "err"); return; }
    const payload = { unit_no: unitNo, tower: g("psf-unit-tower"), floor: g("psf-unit-floor") ? Number(g("psf-unit-floor")) : null, unit_type: g("psf-unit-type"), price: Number(g("psf-unit-price")) || 0, notes: g("psf-unit-notes") };
    closePsModal();
    if (editId) {
      const u = (state.presellUnits || []).find(x => x.id === editId);
      if (u) Object.assign(u, payload);
      if (psCloud()) { const r = await SB.from("presell_units").update(payload).eq("id", editId); if (r.error) toast("Cloud update failed: " + esc(friendlyErr(r.error.message)), "err"); }
      toast("Unit updated");
    } else {
      const rec = Object.assign({ id: "psu-" + Date.now(), project_id: projectId, status: "available", reserved_for: "", reserved_at: null }, payload);
      state.presellUnits.push(rec);
      if (psCloud()) { const baseId = rec.id; delete rec.id; const r = await SB.from("presell_units").insert(Object.assign({ project_id: projectId }, payload)).select("*").single(); if (r.error) { toast("Cloud save failed: " + esc(friendlyErr(r.error.message)), "err"); rec.id = baseId; } else { Object.assign(rec, r.data); } }
      toast("Unit added");
    }
    save(); render();
  }
  async function psSetUnitStatusForBuyer(unitId) {
    if (!currentUser || !currentUser.id) { toast("Sign in with your ES Realty account first", "err"); return; }
    const u = (state.presellUnits || []).find(x => x.id === unitId);
    if (!u || u.status !== "available") return;
    const patch = { status: "reserved", reserved_for: (currentUser.name || currentUser.email || "Buyer"), reserved_by: currentUser.id, reserved_at: new Date().toISOString(), client_email: String(currentUser.email || "").toLowerCase() };
    Object.assign(u, patch); u.reserved_at = patch.reserved_at;
    save(); render(); toast("Unit reserved! Our team will contact you to complete the reservation agreement.");
    if (psCloud()) { const r = await SB.from("presell_units").update(patch).eq("id", unitId); if (r.error) toast("Cloud update failed: " + esc(friendlyErr(r.error.message)), "err"); }
  }
  async function psSetUnitStatus(unitId, status, resName, resContact, resEmail) {
    const u = (state.presellUnits || []).find(x => x.id === unitId);
    if (!u) return;
    const patch = { status: status };
    if (status === "reserved") { u.reserved_for = resName || ""; u.reserved_at = new Date().toISOString(); u.client_email = (resEmail || "").toLowerCase(); patch.reserved_for = u.reserved_for; patch.reserved_at = u.reserved_at; patch.client_email = u.client_email; patch.reserved_by = null; }
    if (status === "available") { u.reserved_for = ""; u.reserved_at = null; patch.reserved_for = ""; patch.reserved_at = null; }
    if (status === "sold" && !u.reserved_for && resName) { u.reserved_for = resName; patch.reserved_for = resName; }
    u.status = status;
    save(); render();
    if (psCloud()) { const r = await SB.from("presell_units").update(patch).eq("id", unitId); if (r.error) toast("Cloud update failed: " + esc(friendlyErr(r.error.message)), "err"); }
  }
  function bindPresellOnce() {
    if (psBound) return;
    psBound = true;
    document.addEventListener("click", async e => {
      const q = s => e.target.closest(s);
      if (q("[data-ps-cancel]")) { closePsModal(); return; }
      const saveProj = q("[data-ps-save-project]");
      if (saveProj) { await psSaveProject(saveProj.getAttribute("data-ps-save-project") || ""); return; }
      const saveUnit = q("[data-ps-save-unit]");
      if (saveUnit) { const parts = (saveUnit.getAttribute("data-ps-save-unit") || "|").split("|"); await psSaveUnit(parts[0], parts[1]); return; }
      const doReserve = q("[data-ps-reserve]");
      if (doReserve) {
        const nm = document.getElementById("psf-res-name");
        if (!nm || !nm.value.trim()) { toast("Client name is required", "err"); return; }
        const ct = document.getElementById("psf-res-contact");
        const uid2 = doReserve.getAttribute("data-ps-reserve");
        closePsModal();
        const em2 = document.getElementById("psf-res-email");
        await psSetUnitStatus(uid2, "reserved", nm.value.trim(), ct ? ct.value.trim() : "", em2 ? em2.value.trim().toLowerCase() : "");
        return;
      }
      const newProj = q("[data-ps-new-project]");
      if (newProj) { psOpenProjectEditor(""); return; }
      const editProj = q("[data-ps-edit-project]");
      if (editProj) { psOpenProjectEditor(editProj.getAttribute("data-ps-edit-project")); return; }
      const archProj = q("[data-ps-archive-project]");
      if (archProj) {
        const pid2 = archProj.getAttribute("data-ps-archive-project");
        if (!confirm("Archive this project? Its units stay intact.")) return;
        const pj = psProject(pid2);
        if (pj) pj.status = "archived";
        save();
        if (psCloud()) { const r = await SB.from("presell_projects").update({ status: "archived" }).eq("id", pid2); if (r.error) toast("Cloud update failed", "err"); }
        toast("Project archived");
        render(); return;
      }
      const openProj = q("[data-ps-open]");
      if (openProj) { state.psProjectId = openProj.getAttribute("data-ps-open"); state.psQuery = ""; state.psStatusFilter = ""; render(); return; }
      if (q("[data-ps-back]")) { state.psProjectId = ""; render(); return; }
      const addUnit = q("[data-ps-add-unit]");
      if (addUnit) { psOpenUnitEditor(addUnit.getAttribute("data-ps-add-unit"), ""); return; }
      const editUnit = q("[data-ps-edit-unit]");
      if (editUnit) {
        const u2 = (state.presellUnits || []).find(x => x.id === editUnit.getAttribute("data-ps-edit-unit"));
        if (u2) psOpenUnitEditor(u2.project_id, u2.id);
        return;
      }
      const schedBtn = q("[data-ps-sched]");
      if (schedBtn) { psOpenSchedule(schedBtn.getAttribute("data-ps-sched")); return; }
      const genBtn = q("[data-ps-gen]");
      if (genBtn) { await psGenerateSchedule(genBtn.getAttribute("data-ps-gen"), true); return; }
      const payBtn = q("[data-ps-pay]");
      if (payBtn) { await psMarkPaid(payBtn.getAttribute("data-ps-pay")); return; }
      const closeSched = q("#ps-modal [data-ps-save][data-ps-close]");
      if (closeSched) { closePsModal(); return; }
      const selfRes = q("[data-ps-self-reserve]");
      if (selfRes) {
        const uid3 = selfRes.getAttribute("data-ps-self-reserve");
        if (!confirm("Reserve this unit under your account?")) return;
        await psSetUnitStatusForBuyer(uid3);
        return;
      }
      const reserveBtn = q("[data-ps-reserve-btn]");
      if (reserveBtn) { psOpenReserve(reserveBtn.getAttribute("data-ps-reserve-btn")); return; }
      const mark = q("[data-ps-mark]");
      if (mark) {
        const parts = (mark.getAttribute("data-ps-mark") || ":").split(":");
        if (parts[1] === "sold") {
          const u3 = (state.presellUnits || []).find(x => x.id === parts[0]);
          await psSetUnitStatus(parts[0], "sold", u3 ? u3.reserved_for : "");
        } else {
          await psSetUnitStatus(parts[0], parts[1]);
        }
        return;
      }
    });
    document.addEventListener("input", e => {
      if (e.target && e.target.id === "ps-q") {
        clearTimeout(window.__psQT);
        window.__psQT = setTimeout(() => { state.psQuery = e.target.value; render(); const el2 = document.getElementById("ps-q"); if (el2) { el2.focus(); el2.setSelectionRange(el2.value.length, el2.value.length); } }, 250);
      }
    });
    document.addEventListener("change", e => {
      if (e.target && e.target.id === "ps-sf") { state.psStatusFilter = e.target.value; render(); }
    });
  }

  /* ================= BUYER PORTAL ================= */
  let portalLoadedKey = "";
  function portalIsMe(u) { return currentUser && currentUser.email && String(u.client_email || "").toLowerCase() === String(currentUser.email).toLowerCase(); }
  function seedPortalSample() {
    psEnsure();
    if (!state.presellProjects.some(p => p.id === "psp-portal")) {
      state.presellProjects.push({ id: "psp-portal", name: "Solstice Residences", developer: "Villanueva Land Corp.", location: "Bacoor, Cavite", lts_no: "LTS-0324-001", turnover_date: "2027-12-31", description: "", status: "active" });
      state.presellUnits.push({ id: "psu-portal-1", project_id: "psp-portal", unit_no: "1206", tower: "A", floor: 12, unit_type: "Studio", price: 2850000, status: "reserved", reserved_for: (currentUser ? currentUser.name : "") || "You", client_email: (currentUser ? currentUser.email : "").toLowerCase(), reserved_at: new Date().toISOString(), notes: "" });
    }
    if (!Array.isArray(state.portalInquiries)) state.portalInquiries = [
      { id: "inq-seed-1", title: "2BR Condo in Makati", status: "contacted", created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
      { id: "inq-seed-2", title: "House & Lot in Cavite", status: "new", created_at: new Date(Date.now() - 1 * 86400000).toISOString() }
    ];
    if (!Array.isArray(state.portalSaved)) state.portalSaved = [
      { id: "sv-seed-1", title: "Shophouse in Davao", price: 12500000, city: "Davao City" }
    ];
  }
  async function loadBuyerPortal(force) {
    if (!currentUser) return;
    const key = currentUser.id || currentUser.email;
    if (!force && portalLoadedKey === key) return;
    portalLoadedKey = key;
    if (!SB || !currentUser.id || currentUser.demo) { seedPortalSample(); return; }
    try {
      psEnsure();
      const units = await SB.from("presell_units").select("*").eq("reserved_by", currentUser.id).order("reserved_at", { ascending: false });
      if (!units.error && Array.isArray(units.data)) state.presellUnits = (state.presellUnits || []).filter(x => x.reserved_by !== currentUser.id).concat(units.data);
      const emailMatch = await SB.from("presell_units").select("*").ilike("client_email", String(currentUser.email || "#").toLowerCase());
      if (!emailMatch.error && Array.isArray(emailMatch.data)) {
        emailMatch.data.forEach(u => { if (!(state.presellUnits || []).some(x => x.id === u.id)) (state.presellUnits = state.presellUnits || []).push(u); });
      }
      const inq = await SB.from("listing_inquiries").select("id,listing_id,full_name,status,created_at").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(10);
      state.portalInquiries = inq.error ? [] : (inq.data || []).map(r => ({ id: r.id, listingId: r.listing_id, status: r.status, created_at: r.created_at, title: r.listing_id }));
      const saved = await SB.from("saved_listings").select("listing_id, created_at, shared_listings(title, price, city)").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(12);
      state.portalSaved = saved.error ? [] : (saved.data || []).map(r => ({ id: r.listing_id, listingId: r.listing_id, title: r.shared_listings ? r.shared_listings.title : r.listing_id, price: r.shared_listings ? r.shared_listings.price : null, city: r.shared_listings ? r.shared_listings.city : "" }));
    } catch (e) { toast("Could not load your portal: " + esc(friendlyErr(e.message)), "err"); }
  }
  function renderBuyerPortal() {
    if (!currentUser) return '<div class="card card-pad empty">Please sign in.</div>';
    loadBuyerPortal();
    psEnsure();
    const myEmail = String(currentUser.email || "").toLowerCase();
    const myUnits = (state.presellUnits || []).filter(u => u.reserved_by === currentUser.id || (u.client_email && String(u.client_email).toLowerCase() === myEmail));
    const inquiries = Array.isArray(state.portalInquiries) ? state.portalInquiries : [];
    const savedListings = Array.isArray(state.portalSaved) ? state.portalSaved : [];
    const totalValue = myUnits.reduce((s, u) => s + Number(u.price || 0), 0);
    let html = '<div class="hero"><div><h1>My Buyer Portal</h1><p>Your reservations, saved properties, and inquiries in one place.</p></div></div>';
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Reserved Units", myUnits.length, "in pre-selling projects", "green", "layers") +
      kpi("Total Reserved Value", C.money(totalValue), "your future home", "gold", "dollar") +
      kpi("Saved Properties", savedListings.length, "shortlisted for you", "blue", "star") +
      kpi("Inquiries", inquiries.length, "sent to brokers", "purple", "chat") + "</div>";
    html += '<div class="card card-pad mb-24"><h3 class="mb-16">My Reservations</h3>';
    if (!myUnits.length) {
      html += '<p class="dim">No reserved units yet. Browse <b>Pre-Selling</b> projects and reserve the unit you love.</p>';
    } else {
      html += '<div class="table-wrap"><table class="data"><tr><th>Project</th><th>Unit</th><th>Type</th><th class="num">Price</th><th>Reserved On</th><th>Status</th></tr>';
      myUnits.forEach(u => {
        const proj = psProject(u.project_id) || {};
        html += '<tr><td><b>' + esc(proj.name || "-") + '</b>' + (proj.lts_no ? ' <span class="badge blue">LTS ' + esc(proj.lts_no) + "</span>" : "") + "</td><td>" + esc((u.tower ? u.tower + "-" : "") + (u.unit_no || "")) + "</td><td>" + esc(u.unit_type || "-") + "</td><td class=\"num\">" + C.money(Number(u.price || 0)) + "</td><td>" + esc(String(u.reserved_at || "").slice(0, 10)) + "</td><td>" + psStatusBadge(u.status) + "</td></tr>";
      });
      html += "</table></div>";
    }
    html += "</div>";
    html += '<div class="grid grid-2">';
    html += '<div class="card card-pad"><h3 class="mb-16">My Inquiries</h3>';
    if (!inquiries.length) {
      html += '<p class="dim">No inquiries yet. Ask about any listing and it will appear here.</p>';
    } else {
      html += '<div class="table-wrap"><table class="data"><tr><th>Property</th><th>Status</th><th>Date</th></tr>';
      inquiries.forEach(q => {
        const m = { new: ["New", "blue"], contacted: ["Contacted", "gold"], qualified: ["Qualified", "green"], closed: ["Closed", "red"], spam: ["Spam", "red"] };
        const c = m[q.status] || [q.status, "blue"];
        html += '<tr><td><b>' + esc(typeof q.title === "string" && q.title.slice(0, 30) === q.title ? q.title : (q.title || "Listing") ) + "</b></td><td><span class=\"badge " + c[1] + "\">" + esc(c[0]) + "</span></td><td>" + esc(String(q.created_at || "").slice(0, 10)) + "</td></tr>";
      });
      html += "</table></div>";
    }
    html += "</div>";
    html += '<div class="card card-pad"><h3 class="mb-16">Saved Properties</h3>';
    if (!savedListings.length) {
      html += '<p class="dim">Nothing saved yet. Tap \u2661 Save on any property in Listings.</p>';
    } else {
      html += '<div class="table-wrap"><table class="data"><tr><th>Property</th><th>Location</th><th class="num">Price</th></tr>';
      savedListings.forEach(sv => {
        html += '<tr><td><b>' + esc(sv.title || sv.id) + "</b></td><td>" + esc(sv.city || "-") + "</td><td class=\"num\">" + (Number(sv.price) > 0 ? C.money(Number(sv.price)) : "-") + "</td></tr>";
      });
      html += "</table></div>";
    }
    html += "</div></div>";
    return html;
  }

  /* ================= NOTIFICATIONS ================= */
  let notifItems = [];
  let notifChannel = null;
  let notifLoadedAt = 0;
  function notifIsCloud() { return !!(SB && currentUser && currentUser.id && !currentUser.demo); }
  function notifUnreadCount() { return notifItems.filter(n => !n.read_at).length; }
  function timeAgo(iso) {
    const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }
  async function refreshNotifications() {
    if (!notifIsCloud()) { notifReset(); return; }
    try {
      const res = await SB.from("notifications").select("id,type,title,body,link_view,read_at,created_at").order("created_at", { ascending: false }).limit(20);
      if (res.error) throw res.error;
      notifItems = res.data || [];
      notifLoadedAt = Date.now();
      notifUpdateChrome();
      if (document.getElementById("notif-panel") && !document.getElementById("notif-panel").classList.contains("hidden")) renderNotifPanel();
    } catch (e) {}
  }
  function notifUpdateChrome() {
    const wrap = document.getElementById("notif-wrap");
    if (!wrap) return;
    wrap.classList.toggle("hidden", !notifIsCloud());
    const badge = document.getElementById("notif-badge");
    if (!badge) return;
    const n = notifUnreadCount();
    badge.textContent = n > 9 ? "9+" : String(n);
    badge.classList.toggle("hidden", n === 0);
  }
  function notifReset() {
    notifItems = [];
    notifLoadedAt = 0;
    if (notifChannel && SB) { try { SB.removeChannel(notifChannel); } catch (e) {} notifChannel = null; }
    notifUpdateChrome();
    const p = document.getElementById("notif-panel");
    if (p) { p.classList.add("hidden"); p.innerHTML = ""; }
  }
  function notifSubscribeRealtime() {
    if (!notifIsCloud() || notifChannel || !SB.channel) return;
    notifChannel = SB.channel("ntf-" + currentUser.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + currentUser.id }, payload => {
        const row = payload.new || {};
        if (notifItems.some(n => n.id === row.id)) return;
        notifItems.unshift(row);
        notifUpdateChrome();
        toast("<b>" + esc(row.title || "Notification") + "</b>", "info");
        const pnl = document.getElementById("notif-panel");
        if (pnl && !pnl.classList.contains("hidden")) renderNotifPanel();
      })
      .subscribe();
  }
  function renderNotifPanel() {
    const pnl = document.getElementById("notif-panel");
    if (!pnl) return;
    if (!notifItems.length) { pnl.innerHTML = '<div class="ntf-empty">No notifications yet.</div>'; return; }
    const items = notifItems.map(n => {
      const meta = JSON.stringify({ id: n.id, link: n.link_view || "" });
      return '<button type="button" class="ntf-item' + (n.read_at ? "" : " unread") + '" data-ntf="' + esc(meta) + '">' +
        (!n.read_at ? '<span class="ntf-dot"></span>' : "") +
        '<span class="ntf-main"><b>' + esc(n.title || "Notification") + "</b>" +
        (n.body ? '<span class="ntf-body">' + esc(n.body) + "</span>" : "") +
        '<span class="ntf-time">' + esc(timeAgo(n.created_at)) + "</span></span></button>";
    }).join("");
    pnl.innerHTML = '<div class="ntf-head"><b>Notifications</b><button type="button" class="link-btn" id="ntf-markall">Mark all read</button></div>' + items;
  }
  async function notifMarkRead(id) {
    const local = notifItems.find(n => n.id === id);
    if (local && !local.read_at) { local.read_at = new Date().toISOString(); notifUpdateChrome(); }
    if (SB) { try { await SB.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id); } catch (e) {} }
    renderNotifPanel();
  }
  async function notifMarkAllRead() {
    const ids = notifItems.filter(n => !n.read_at).map(n => n.id);
    notifItems.forEach(n => { if (!n.read_at) n.read_at = new Date().toISOString(); });
    notifUpdateChrome(); renderNotifPanel();
    if (ids.length && SB) { try { await SB.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids); } catch (e) {} }
  }
  function bindNotifications() {
    const bell = document.getElementById("notif-bell");
    const pnl = document.getElementById("notif-panel");
    if (!bell || !pnl) return;
    bell.addEventListener("click", async e => {
      e.stopPropagation();
      const willOpen = pnl.classList.contains("hidden");
      pnl.classList.toggle("hidden", !willOpen);
      if (!willOpen) return;
      renderNotifPanel();
      if (Date.now() - notifLoadedAt > 30000) await refreshNotifications();
      renderNotifPanel();
    });
    document.addEventListener("click", e => {
      if (!e.target.closest("#notif-wrap")) pnl.classList.add("hidden");
    });
    pnl.addEventListener("click", async ev => {
      const markAll = ev.target.closest("#ntf-markall");
      if (markAll) { ev.stopPropagation(); await notifMarkAllRead(); return; }
      const item = ev.target.closest("[data-ntf]");
      if (!item) return;
      let info = {};
      try { info = JSON.parse(item.getAttribute("data-ntf")); } catch (err) {}
      await notifMarkRead(info.id);
      pnl.classList.add("hidden");
      if (info.link && navAllowed(info.link)) navigate(info.link);
    });
  }
  async function restoreSupabaseSession() {
    if (!(await sbUp())) return;
    if (!SB) return;
    const { data: sessionData, error: sessionError } = await SB.auth.getSession();
    if (sessionError || !sessionData.session) return;
    currentUser = await loadSupabaseProfile(sessionData.session.user);
    await requireApprovedProfile(currentUser);
    await loadCurrentUserCloudState();
    applyPostLoginView();
    await loadBrokerTeam();
    await loadCloudListings();
    await completePostAuthIntent();
    await loadCloudLeads();
    await loadCloudTransactions();
    await loadCloudPlaybooks();
    try { await migrateVaultToCloud(); } catch (vaultMigrateErr) {}
    await refreshNotifications();
    notifSubscribeRealtime();
  }

  /* ================= HELPERS ================= */
  function toast(msg, type) {
    const t = document.createElement("div");
    t.className = "toast " + (type || "ok");
    t.innerHTML = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .4s"; }, 2800);
    setTimeout(() => t.remove(), 3300);
  }

  function popupNotify(msg, type) {
    const wrap = document.createElement("div");
    wrap.className = "popup-notify";
    wrap.innerHTML = '<div class="popup-toast ' + (type || "ok") + '">' + msg + "</div>";
    document.body.appendChild(wrap);
    let done = false;
    const dismiss = () => {
      if (done) return; done = true;
      wrap.style.opacity = "0"; wrap.style.transition = "opacity .3s";
      setTimeout(() => wrap.remove(), 320);
    };
    wrap.addEventListener("click", e => { if (e.target === wrap) dismiss(); });
    setTimeout(dismiss, 4000);
  }

  function freshDeal() {
    return {
      property: { name: "", region: "", province: "", city: "", barangay: "", address: "", lat: "", lng: "", lotArea: 200, frontage: 10, depth: 20, roadWidth: 8, roadType: "Barangay Road", landUse: "Residential", zoning: "Residential", floodRisk: "Low", propertyType: "Vacant Lot", structureType: "House", structures: [], yearBuilt: 0, floors: 1, existingFloorArea: 0, condition: "Good", improvementValue: 0, incomeGenerating: "No", monthlyIncome: 0, marketValuePerSqm: 0, birZonalPerSqm: 0, growthRate: 0.07, utilities: { Electricity: true, Water: true, Internet: true, Sewer: false } },
      purchase: { price: 4000000, negotiatedPrice: 3800000, sellerType: "Owner", taxes: 0, transferFees: 60000, legalFees: 50000, surveyCost: 30000, miscCost: 25000 },
      financing: { type: "Bank Loan", loanPct: 60, interestRate: 7.5, years: 15 },
      development: { goal: "custom", devType: "Townhouse", constCostPerSqm: 38000, far: 1.5, floorArea: 0, buildMonths: 14, siteDevPct: 8, profFeesPct: 6, permits: 150000, contingencyPct: 10, marketing: 0, amenities: 0, lots: 0, lotSqm: 0, roadPct: 20, openSpacePct: 10, lotDevCostPerSqm: 0, projectBudget: 0, units: 0, floors: 0, mixResPct: 0, carryingMonthly: 0 },
      sales: { saleMode: "sell", sellPricePerSqm: 115000, landSellPricePerSqm: 22000, rentalRatePerSqm: 450, units: 6, saleablePct: 82, leasablePct: 70, occupancyPct: 90, opCostPct: 25, capRate: 0, appreciationRate: 7, holdYears: 10, sellingCostPct: 5, cgtPct: 6, dstPct: 1.5, registrationFeePct: 0.25, notarialFeePct: 0.5, cgtAmount: 0, dstAmount: 0, transferTaxAmount: 0, registrationFeeAmount: 0, notarialFeeAmount: 0, brokerPct: 3, vatPct: 0, discountRate: 10 },
      location: { nearby: {}, accessibilityScore: 60, trafficScore: 40, populationScore: 60, futureDevScore: 60, competitionScore: 40, commercialGrowthScore: 60 },
      building: { constructionType: "CHB / Masonry" },
      comparables: [],
      intent: "buying"
    };
  }
  function sampleDeal() {
    const d = freshDeal();
    d.property = Object.assign(d.property, { name: "Acacia Heights Residential Lot", province: "Cavite", city: "Imus", barangay: "Buhay na Tubig", address: "Brgy. Buhay na Tubig, Imus City", lat: "14.4297", lng: "120.9367", lotArea: 250, frontage: 12, depth: 20.8, roadWidth: 10, roadType: "Provincial Road", landUse: "Residential", zoning: "Residential", floodRisk: "Low", propertyType: "Vacant Lot", marketValuePerSqm: 18500, growthRate: 0.09 });
    d.purchase = { price: 4500000, negotiatedPrice: 4200000, sellerType: "Owner", taxes: 0, transferFees: 67500, legalFees: 55000, surveyCost: 35000, miscCost: 30000 };
    d.financing = { type: "Bank Loan", loanPct: 60, interestRate: 7.5, years: 15 };
    d.development = Object.assign(d.development, { devType: "Townhouse", constCostPerSqm: 38000, far: 1.5, buildMonths: 14 });
    d.sales = Object.assign(d.sales, { saleMode: "sell", sellPricePerSqm: 115000, units: 6, occupancyPct: 92 });
    d.location = Object.assign(d.location, { nearby: { "School": true, "Bank": true, "Market": true, "Church": true, "Restaurant": true, "Mall": true, "Transit": true }, accessibilityScore: 78, populationScore: 70, futureDevScore: 80, commercialGrowthScore: 75 });
    d.comparables = [
      { id: "wc-1", type: "Sale", address: "Brgy. San Juan, near Imus City Hall", city: "Imus", price: 4700000, floorArea: 0, lotArea: 240, date: "2026-01-15", source: "Broker" },
      { id: "wc-2", type: "Sale", address: "Buhay na Tubig Subdivision", city: "Imus", price: 4300000, floorArea: 0, lotArea: 220, date: "2025-11-08", source: "Listings" },
      { id: "wc-3", type: "Rental", address: "Anabu II, near Molino Blvd", city: "Imus", price: 28000, floorArea: 60, lotArea: 0, date: "2025-12-01", source: "Tenant survey" }
    ];
    return d;
  }

  /* Per Development Type input sets — the wizard only shows the fields relevant to the selected type.
   * Each entry: title (section header), note (AI banner), fields: [key, label, suffix] on development.*/
  const DEV_FIELD_SETS = {
    "Vacant Lot": { title: "Land — no construction", note: "Hold as raw land: development cost is limited to fees, contingency and marketing. No building inputs are needed.", fields: [] },
    "Townhouse": { title: "Townhouse — residential units", note: "Compact attached units on individual lots; revenue comes from selling the units.", fields: [["units", "Number of Units", ""], ["floorArea", "Total Floor Area to Build", "sqm"], ["constCostPerSqm", "Construction Cost / sqm", "₱"], ["buildMonths", "Construction Months", "mos"], ["siteDevPct", "Site Development (%)", "%"], ["profFeesPct", "Professional Fees (%)", "%"]] },
    "Apartment": { title: "Apartment — multi-unit rental", note: "Multi-unit rental building; revenue comes from monthly rent on the leasable units.", fields: [["units", "Number of Units", ""], ["floors", "Number of Floors", ""], ["floorArea", "Total Floor Area to Build", "sqm"], ["constCostPerSqm", "Construction Cost / sqm", "₱"], ["buildMonths", "Construction Months", "mos"], ["siteDevPct", "Site Development (%)", "%"], ["profFeesPct", "Professional Fees (%)", "%"]] },
    "Shophouse": { title: "Shophouse — retail ground + residential above", note: "Commercial ground floor with residential floors above; revenue blends rents and unit sales.", fields: [["units", "Number of Units", ""], ["floors", "Number of Floors", ""], ["floorArea", "Total Floor Area to Build", "sqm"], ["constCostPerSqm", "Construction Cost / sqm", "₱"], ["buildMonths", "Construction Months", "mos"], ["siteDevPct", "Site Development (%)", "%"], ["profFeesPct", "Professional Fees (%)", "%"]] },
    "Commercial": { title: "Commercial — rentable spaces", note: "Rentable commercial spaces; revenue comes from leases on the leasable floor area.", fields: [["floors", "Number of Floors", ""], ["floorArea", "Total Floor Area to Build", "sqm"], ["constCostPerSqm", "Construction Cost / sqm", "₱"], ["buildMonths", "Construction Months", "mos"], ["siteDevPct", "Site Development (%)", "%"], ["profFeesPct", "Professional Fees (%)", "%"]] },
    "Warehouse": { title: "Warehouse — storage / logistics", note: "Industrial warehouse floor area; typically a lower construction cost per sqm.", fields: [["floors", "Number of Floors", ""], ["floorArea", "Total Floor Area to Build", "sqm"], ["constCostPerSqm", "Construction Cost / sqm", "₱"], ["buildMonths", "Construction Months", "mos"], ["siteDevPct", "Site Development (%)", "%"], ["profFeesPct", "Professional Fees (%)", "%"]] },
    "Mixed Use": { title: "Mixed Use — residential + commercial", note: "Combines residential and commercial; revenue blends rentals and sales across both components.", fields: [["mixResPct", "Residential Share of Floor Area (%)", "%"], ["floorArea", "Total Floor Area to Build", "sqm"], ["constCostPerSqm", "Construction Cost / sqm", "₱"], ["buildMonths", "Construction Months", "mos"], ["siteDevPct", "Site Development (%)", "%"], ["profFeesPct", "Professional Fees (%)", "%"]] },
    "Subdivision": { title: "Subdivision — lot development", note: "Costs are based on <b>lot development cost × gross lot area</b>; revenue comes from selling the <b>net saleable lots</b> after roads &amp; open space are set aside.", fields: [["lots", "Number of Residential Lots", ""], ["lotSqm", "Typical Lot Size", "sqm"], ["roadPct", "Roads & Right-of-Way (%)", "%"], ["openSpacePct", "Parks & Open Space (%)", "%"], ["lotDevCostPerSqm", "Lot Development Cost / sqm", "₱"], ["buildMonths", "Development Period", "mos"], ["profFeesPct", "Professional Fees (%)", "%"]] },
    "Subdivision + Shophouse": { title: "Subdivision + Shophouse — lots and finished retail units", note: "Develop roads and open space, reserve selected lots for shophouses, then sell both the remaining lots and finished shophouse floor area.", fields: [["lots", "Planned Lots", ""], ["lotSqm", "Typical Lot Size", "sqm"], ["shophouseLots", "Lots Reserved for Shophouses", ""], ["floorArea", "Total Shophouse Floor Area", "sqm"], ["roadPct", "Roads & Right-of-Way (%)", "%"], ["openSpacePct", "Parks & Open Space (%)", "%"], ["lotDevCostPerSqm", "Lot Development Cost / sqm", "₱"], ["constCostPerSqm", "Shophouse Construction Cost / sqm", "₱"], ["buildMonths", "Development Period", "mos"]] }
  };

  const DEVELOPMENT_GOALS = [["custom", "Custom plan"]].concat(Object.keys(C.SCENARIOS).map(k => [k, C.SCENARIOS[k].label]));
  function developmentSalesProfile(type, goal) {
    const goalModes = { buyhold: "rent", develop_sell: "sell", apartment: "rent", shophouse: "hybrid", subdivide: "sell", raw_land: "sell", commercial: "rent", mixed: "hybrid" };
    const typeModes = { "Vacant Lot": "sell", "Townhouse": "sell", "Apartment": "rent", "Shophouse": "hybrid", "Commercial": "rent", "Warehouse": "rent", "Mixed Use": "hybrid", "Subdivision": "sell", "Subdivision + Shophouse": "sell" };
    const saleLabel = type === "Vacant Lot" ? "Land Selling Price / sqm" : type === "Subdivision" ? "Selling Price / Net Saleable sqm" : type === "Subdivision + Shophouse" ? "Shophouse Selling Price / sqm" : "Selling Price / sqm";
    const unitLabel = type === "Subdivision" ? "Number of Saleable Lots" : type === "Subdivision + Shophouse" ? "Total Lots / Shophouses for Sale" : "Number of Units";
    const rentLabel = type === "Apartment" ? "Apartment Rent / sqm/mo" : type === "Commercial" ? "Commercial Lease Rate / sqm/mo" : type === "Warehouse" ? "Warehouse Lease Rate / sqm/mo" : "Rental Rate / sqm/mo";
    return { saleMode: goalModes[goal] || typeModes[type] || "sell", saleLabel, unitLabel, rentLabel };
  }
  function syncSalesToDevelopment(d) {
    const dev = d.development, profile = developmentSalesProfile(dev.devType, dev.goal);
    d.sales.saleMode = profile.saleMode;
    if (dev.devType === "Subdivision" || dev.devType === "Subdivision + Shophouse") d.sales.units = dev.lots;
    else if (dev.units > 0) d.sales.units = dev.units;
  }
  function developmentSalesSummary(d) {
    const dev = d.development, type = dev.devType;
    if (type === "Subdivision") return C.numFmt(dev.lots) + " saleable lots · " + C.numFmt(dev.lotSqm) + " sqm typical lot size";
    if (type === "Subdivision + Shophouse") return C.numFmt(Math.max(0, dev.lots - dev.shophouseLots)) + " lot-sale allocation + " + C.numFmt(dev.shophouseLots) + " shophouse lot(s) · " + C.numFmt(dev.floorArea) + " sqm shophouse floor area";
    if (dev.units > 0 && dev.floorArea > 0) return C.numFmt(dev.units) + " units · " + C.numFmt(Math.round(dev.floorArea / dev.units)) + " sqm average floor area per unit";
    if (dev.floorArea > 0) return C.numFmt(dev.floorArea) + " sqm total floor area · " + C.numFmt(dev.floors || 1) + " floor" + (C.num(dev.floors, 1) === 1 ? "" : "s");
    return C.numFmt(d.property.lotArea) + " sqm land area";
  }
  function applyDevelopmentPreset(d, goal, selectedType) {
    const scenario = goal && goal !== "custom" ? C.SCENARIOS[goal] : null;
    const lot = Math.max(0, C.num(d.property.lotArea, 0));
    const type = scenario ? scenario.devType : selectedType;
    const presets = {
      "Townhouse": { floorArea: Math.round(lot * 1.2), units: Math.max(2, Math.floor(lot / 45)), floors: 2, constCostPerSqm: 38000, buildMonths: 14 },
      "Apartment": { floorArea: Math.round(lot * 1.8), units: Math.max(4, Math.floor(lot / 35)), floors: 3, constCostPerSqm: 36000, buildMonths: 16 },
      "Shophouse": { floorArea: Math.round(lot * 1.2), units: Math.max(2, Math.floor(lot / 50)), floors: 2, constCostPerSqm: 42000, buildMonths: 14 },
      "Commercial": { floorArea: Math.round(lot * 0.7), units: 0, floors: 1, constCostPerSqm: 35000, buildMonths: 12 },
      "Warehouse": { floorArea: Math.round(lot * 0.65), units: 0, floors: 1, constCostPerSqm: 28000, buildMonths: 10 },
      "Mixed Use": { floorArea: Math.round(lot * 1.8), units: 0, floors: 3, constCostPerSqm: 40000, buildMonths: 18, mixResPct: 60 },
      "Subdivision": { floorArea: 0, units: 0, floors: 0, lots: Math.max(1, Math.floor(lot * 0.7 / 80)), lotSqm: 80, lotDevCostPerSqm: 3500, buildMonths: 12 },
      "Subdivision + Shophouse": { floorArea: 120, units: 0, floors: 2, lots: Math.max(2, Math.floor(lot / 80)), lotSqm: 80, shophouseLots: 1, lotDevCostPerSqm: 3500, constCostPerSqm: 42000, buildMonths: 18 },
      "Vacant Lot": { floorArea: 0, units: 0, floors: 0, buildMonths: 0 }
    };
    d.development = Object.assign(d.development, presets[type] || {}, { goal: goal || "custom", devType: type });
    syncSalesToDevelopment(d);
  }

  /* ================= MAP PINPOINT (Leaflet + OSM/CARTO + Nominatim) ================= */
  const _mapRegistry = {};
  let _forceMapSearch = false;
  window.__esrMaps = _mapRegistry;
  function mapPickerHtml(id, lat, lng) {
    const hasPin = !!(lat && lng);
    return '<div class="field col-12"><label>Pinpoint Location on Map</label>' +
      '<div class="map-search"><input class="input" id="' + id + '-q" type="text" placeholder="Search a place — e.g. Makati City, Cavite" value=""><button class="btn btn-ghost btn-sm" id="' + id + '-btn" type="button">' + icon("pin", 13) + ' Locate</button></div>' +
      '<div class="map-picker" id="' + id + '"></div>' +
      '<div class="map-coords" id="' + id + '-coords">' + (hasPin ? 'Pin: Latitude <b>' + esc(lat) + '</b> &middot; Longitude <b>' + esc(lng) + '</b>' : 'Select a Region / Province / City above, or search below — the map jumps there and Latitude/Longitude fill in automatically.') + '</div></div>';
  }
  function destroyMapPickers() {
    Object.keys(_mapRegistry).forEach(k => { try { _mapRegistry[k].map.remove(); } catch (e) { /* noop */ } });
    Object.keys(_mapRegistry).forEach(k => delete _mapRegistry[k]);
  }
  function geocodePlace(query, cb) {
    if (!query) { cb(null); return; }
    const q = /philippines/i.test(query) ? query : query + ", Philippines";
    fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=en&q=" + encodeURIComponent(q))
      .then(r => r.json())
      .then(j => { if (j && j.length) cb({ lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), label: j[0].display_name }); else cb(null); })
      .catch(() => cb(null));
  }
  function pinMap(id, ll, zoom) {
    const entry = _mapRegistry[id];
    if (!entry) return;
    if (!entry.marker) {
      entry.marker = L.marker(ll, { draggable: true }).addTo(entry.map);
      entry.marker.on("dragend", () => pinMap(id, entry.marker.getLatLng()));
    } else {
      entry.marker.setLatLng(ll);
    }
    if (zoom) entry.map.setView(ll, zoom, { animate: false });
    const ln = ll.lat.toFixed(6), lo = ll.lng.toFixed(6);
    const c = document.getElementById(id + "-coords");
    if (c) c.innerHTML = "Pin: Latitude <b>" + esc(ln) + "</b> &middot; Longitude <b>" + esc(lo) + "</b>";
    entry.onPick(ln, lo);
  }
  function searchMapOnPicker(id, query) {
    const entry = _mapRegistry[id];
    if (!entry || !query) return;
    const token = ++entry.token;
    clearTimeout(entry.deb);
    entry.deb = setTimeout(() => {
      geocodePlace(query, res => {
        if (res && entry.token === token) pinMap(id, L.latLng(res.lat, res.lng), Math.max(entry.map.getZoom(), 12));
      });
    }, 400);
  }
  function initMapPicker(id, lat, lng, onPick, searchText) {
    if (!document.getElementById(id)) return;
    if (!window.L) { window.ESREALTY_LEAFLET.ensure().then(() => initMapPicker(id, lat, lng, onPick, searchText)); return; }
    if (_mapRegistry[id]) { try { _mapRegistry[id].map.remove(); } catch (e) { /* noop */ } }
    const dark = (document.documentElement.getAttribute("data-theme") || "dark") === "dark";
    const tiles = dark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    const latN = parseFloat(lat), lngN = parseFloat(lng);
    const hasPin = isFinite(latN) && isFinite(lngN);
    const center = hasPin ? [latN, lngN] : [13.0, 122.0];
    const map = L.map(id, { center: center, zoom: hasPin ? 14 : 5, scrollWheelZoom: true });
    L.tileLayer(tiles, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd", maxZoom: 19
    }).addTo(map);
    const entry = { map: map, marker: null, onPick: onPick, token: 0, deb: null };
    if (hasPin) {
      entry.marker = L.marker(center, { draggable: true }).addTo(map);
      entry.marker.on("dragend", () => pinMap(id, entry.marker.getLatLng()));
    }
    map.on("click", e => pinMap(id, e.latlng));
    _mapRegistry[id] = entry;
    const q = document.getElementById(id + "-q"), btn = document.getElementById(id + "-btn");
    if (q && btn) {
      const go = () => searchMapOnPicker(id, q.value.trim());
      btn.addEventListener("click", go);
      q.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    }
    if (searchText) searchMapOnPicker(id, searchText);
    return entry;
  }

  /* ---------- AI Location Analysis (from the pinned map location)
   * Reverse-geocodes the pin via Nominatim and scans nearby establishments
   * via the free OpenStreetMap Overpass API, then fills admin fields and
   * recomputes the location scores from the findings. ---------- */
  const NEARBY_CATEGORY_QUERIES = [
    ["School", 'nwr["amenity"~"^(school|kindergarten|college|university)$"](around:1000,{LAT},{LNG});'],
    ["Hospital", 'nwr["amenity"~"^(hospital|clinic)$"](around:1000,{LAT},{LNG});'],
    ["Bank", 'nwr["amenity"~"^(bank|atm)$"](around:1000,{LAT},{LNG});'],
    ["Convenience Store", 'nwr["shop"="convenience"](around:1000,{LAT},{LNG});'],
    ["Gas Station", 'nwr["amenity"="fuel"](around:1000,{LAT},{LNG});'],
    ["Market", 'nwr["amenity"="marketplace"](around:1000,{LAT},{LNG});nwr["shop"~"^(supermarket|wholesale)$"](around:1000,{LAT},{LNG});'],
    ["Church", 'nwr["amenity"="place_of_worship"](around:1000,{LAT},{LNG});'],
    ["Restaurant", 'nwr["amenity"~"^(restaurant|fast_food|cafe)$"](around:1000,{LAT},{LNG});'],
    ["Mall", 'nwr["shop"="mall"](around:1000,{LAT},{LNG});'],
    ["Transit", 'nwr["railway"~"^(station|stop)$"](around:1000,{LAT},{LNG});nwr["public_transport"="station"](around:1000,{LAT},{LNG});nwr["highway"="bus_stop"](around:1000,{LAT},{LNG});']
  ];

  function reverseGeocodePin(lat, lng, cb) {
    fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&accept-language=en&lat=" + lat + "&lon=" + lng, { headers: { "Accept": "application/json" } })
      .then(r => { if (!r.ok) throw new Error("Reverse geocoding unavailable"); return r.json(); })
      .then(j => cb(j))
      .catch(() => cb(null));
  }
  const OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
  ];
  function fetchNearbyCounts(lat, lng, cb, errCb) {
    var statusEl = document.getElementById("wz-ai-loc-status");
    var base = "";
    if (window.ESREALTY_API_BASE) base = String(window.ESREALTY_API_BASE).replace(/\/functions\/v1\/listing-api\/api$/, "");
    else if (window.ESREALTY_SUPABASE && window.ESREALTY_SUPABASE.supabaseUrl) base = window.ESREALTY_SUPABASE.supabaseUrl;
    else base = "https://mrngaqtbaseewzcsogqi.supabase.co";
    var edgeUrl = base + "/functions/v1/nearby-scan";
    var anonKey = (window.ESREALTY_SUPABASE && window.ESREALTY_SUPABASE.supabaseKey) || "";
    if (statusEl) statusEl.textContent = "Scanning nearby establishments via cloud...";
    fetch(edgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + anonKey, "apikey": anonKey },
      body: JSON.stringify({ lat: lat, lng: lng })
    }).then(function (r) { if (!r.ok) throw new Error("edge " + r.status); return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.counts) { if (statusEl) statusEl.textContent = "Scan complete — " + data.counts.present + " nearby type(s) found."; cb(data.counts); return; }
        throw new Error("edge returned no data");
      })
      .catch(function () {
        if (statusEl) statusEl.textContent = "Cloud scan unavailable, trying direct Overpass...";
        fetchNearbyDirect(lat, lng, cb, errCb, statusEl);
      });
  }
  function fetchNearbyDirect(lat, lng, cb, errCb, statusEl) {
    const parts = NEARBY_CATEGORY_QUERIES.map(c => c[1].replace("{LAT}", lat).replace("{LNG}", lng) + "\nout count;\n");
    const query = "[out:json][timeout:25];\n" + parts.join("");
    function tryMirror(idx) {
      if (idx >= OVERPASS_MIRRORS.length) { if (errCb) errCb(); return; }
      var ctl = new AbortController();
      var timer = setTimeout(() => ctl.abort(), 30000);
      if (statusEl && idx > 0) statusEl.textContent = "Retrying with backup mirror (" + (idx + 1) + "/" + OVERPASS_MIRRORS.length + ")...";
      fetch(OVERPASS_MIRRORS[idx], {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: ctl.signal
      }).then(r => { clearTimeout(timer); if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(j => { clearTimeout(timer); parseOverpassResults(j, cb); })
        .catch(() => { clearTimeout(timer); tryMirror(idx + 1); });
    }
    tryMirror(0);
  }
  function parseOverpassResults(j, cb) {
    const els = (j && j.elements) || [];
    const res = { found: {}, present: 0 };
    NEARBY_CATEGORY_QUERIES.forEach((c, i) => {
      const el = els[i];
      let count = 0;
      if (el && el.groups) el.groups.forEach(g => { count += g.count || 0; });
      else if (el && el.tags) count = (C.num(el.tags.nodes, 0) + C.num(el.tags.ways, 0) + C.num(el.tags.relations, 0)) || C.num(el.tags.total, 0);
      res.found[c[0]] = count;
      if (count > 0) res.present++;
    });
    cb(res);
  }
  function findCityAdmin(name) {
    const norm = v => String(v || "").toLowerCase().replace(/\b(city|municipality|municipal|metropolitan)\b/g, "").replace(/[^a-z0-9]/g, "");
    const n = norm(name);
    if (!n) return null;
    for (const region of D.regionNames()) {
      for (const province of D.provincesFor(region)) {
        const c = D.citiesFor(region, province).find(x => norm(x) === n);
        if (c) return { region: region, province: province, city: c };
      }
    }
    return null;
  }
  function applyWizardLocationAnalysis(d, rev, counts) {
    const p = d.property, loc = d.location;
    if (rev && rev.address) {
      const ad = rev.address;
      const cityNames = [ad.city, ad.town, ad.municipality, ad.county].filter(Boolean);
      let chain = null;
      for (const n of cityNames) { chain = findCityAdmin(n); if (chain) break; }
      if (chain) {
        p.region = chain.region; p.province = chain.province; p.city = chain.city;
      } else {
        const region = D.regionNames().find(r => (String(ad.region || ad.state_district || "").toLowerCase().indexOf(r.toLowerCase()) !== -1) || (String(r).toLowerCase().indexOf(String(ad.region || ad.state_district || "").toLowerCase()) !== -1));
        if (region) {
          p.region = region;
          const prov = D.provincesFor(region).find(x => String(ad.state || ad.county || "").toLowerCase().indexOf(String(x).toLowerCase()) !== -1);
          if (prov) {
            p.province = prov;
            const c = D.citiesFor(region, prov).find(x => cityNames.some(n => String(x).toLowerCase().indexOf(String(n).toLowerCase()) !== -1));
            if (c) p.city = c;
          }
        }
      }
      const brgy = ad.barangay || ad.village || ad.city_district || ad.neighbourhood;
      if (brgy && !p.barangay) p.barangay = brgy;
      if (!p.address && rev.display_name) p.address = rev.display_name;
    }
    if (counts && counts.found) {
      const n = type => Math.min(C.num(counts.found[type], 0), 3);
      D.NEARBY_TYPES.forEach(t => { loc.nearby[t] = counts.found[t] > 0; });
      loc.accessibilityScore = C.clamp(30 + n("Transit") * 14 + n("Market") * 8 + n("Convenience Store") * 5 + n("Gas Station") * 3 + n("School") * 4, 30, 95);
      loc.trafficScore = C.clamp(28 + n("Transit") * 12 + n("Market") * 8 + n("Mall") * 7 + n("Restaurant") * 4, 25, 90);
      loc.populationScore = C.clamp(32 + n("School") * 7 + n("Hospital") * 9 + n("Market") * 8 + n("Restaurant") * 4 + n("Convenience Store") * 4, 30, 95);
      loc.futureDevScore = C.clamp(38 + n("Transit") * 11 + n("Mall") * 8 + n("Hospital") * 6 + n("Bank") * 5, 30, 92);
      loc.competitionScore = C.clamp(20 + n("Restaurant") * 8 + n("Mall") * 10 + n("Market") * 6 + n("Convenience Store") * 4, 20, 85);
      loc.commercialGrowthScore = C.clamp(30 + n("Transit") * 9 + n("Mall") * 9 + n("Bank") * 6 + n("Market") * 7 + n("Restaurant") * 4, 30, 95);
    }
    if (!C.num(p.marketValuePerSqm, 0) && p.city) p.marketValuePerSqm = D.benchmarkFor(p.city);
    loc.analysis = {
      analyzedAt: new Date().toISOString(),
      address: rev && rev.display_name ? rev.display_name : "",
      nearby: counts && counts.found ? counts.found : {},
      typesFound: counts ? counts.present : 0
    };
  }
  function runWizardLocationAnalysis() {
    const d = gatherDeal();
    const lat = C.num(d.property.lat), lng = C.num(d.property.lng);
    if (!isFinite(lat) || !isFinite(lng) || !lat || !lng) { toast("Drop a pin on the map first, then analyze", "err"); return; }
    const btn = $("#wz-ai-loc"), status = $("#wz-ai-loc-status");
    if (btn) btn.disabled = true;
    if (status) status.innerHTML = "Validating pin, resolving the address, and scanning nearby establishments.";
    reverseGeocodePin(lat, lng, rev => {
      const country = rev && rev.address ? String(rev.address.country_code || "").toLowerCase() : "";
      if (country && country !== "ph") {
        if (btn) btn.disabled = false;
        if (status) status.textContent = "The pin appears to be outside the Philippines. Move it to the property location and try again.";
        toast("Move the pin to a Philippine property location before analyzing", "err");
        return;
      }
      fetchNearbyCounts(lat, lng, counts => {
        applyWizardLocationAnalysis(d, rev, counts);
        save(); render();
        toast("Location analysis complete — address verified and <b>" + counts.present + "</b> nearby establishment type(s) found", "ok");
      }, () => {
        applyWizardLocationAnalysis(d, rev, null);
        save(); render();
        toast("Address auto-filled; nearby scan unavailable (offline) — scores left as set", "info");
      });
    });
  }

  function polygonAreaM2(points) {
    if (!points || points.length < 3) return 0;
    const R = 6371000, toRad = Math.PI / 180;
    const avgLat = points.reduce((s, p) => s + p[0], 0) / points.length * toRad;
    const cosLat = Math.cos(avgLat);
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const ax = a[1] * toRad * cosLat, ay = a[0] * toRad;
      const bx = b[1] * toRad * cosLat, by = b[0] * toRad;
      area += ax * by - bx * ay;
    }
    return Math.abs(area) / 2 * R * R;
  }

  function apprMapHtml(id, lat, lng, polygon, area) {
    const hasPin = !!(lat && lng);
    const pts = (polygon && polygon.length) ? polygon : [];
    return '<div class="field col-12"><label>Pinpoint Location on Map</label>' +
      '<div class="map-search"><input class="input" id="' + id + '-q" type="text" placeholder="Search a place — e.g. Makati City, Cavite" value=""><button class="btn btn-ghost btn-sm" id="' + id + '-btn" type="button">' + icon("pin", 13) + ' Locate</button></div>' +
      '<div class="map-tools"><button type="button" class="opt on" id="' + id + '-pinmode">' + icon("pin", 12) + ' Pin Location</button>' +
      '<button type="button" class="opt" id="' + id + '-plotmode">' + icon("grid", 12) + ' Plot Land</button></div>' +
      '<div class="map-picker" id="' + id + '"></div>' +
      '<div class="map-coords" id="' + id + '-coords">' + (hasPin ? 'Pin: Latitude <b>' + esc(lat) + '</b> &middot; Longitude <b>' + esc(lng) + '</b>' : 'Click the map to pin the property, or switch to <b>Plot Land</b> to draw its boundary.') + '</div>' +
      '<div class="plot-status" id="' + id + '-plot">' + (pts.length >= 3
        ? '<b>' + pts.length + ' points</b> plotted &middot; area &asymp; <b>' + C.fmtNum(Math.round(polygonAreaM2(pts))) + ' sqm</b>'
        : '<span class="dim">No land plot yet — switch to <b>Plot Land</b> and click the corners of the property on the map.</span>') + '</div></div>';
  }

  function apprPlotSketch(pts, area) {
    if (!pts || pts.length < 3) return "";
    const lats = pts.map(p => parseFloat(p[0])), lngs = pts.map(p => parseFloat(p[1]));
    if (lats.some(isNaN) || lngs.some(isNaN)) return "";
    const minL = Math.min.apply(null, lngs), maxL = Math.max.apply(null, lngs);
    const minA = Math.min.apply(null, lats), maxA = Math.max.apply(null, lats);
    const spanL = maxL - minL || 0.0001, spanA = maxA - minA || 0.0001;
    const W = 260, H = 190, pad = 16;
    const sc = Math.min((W - pad * 2) / spanL, (H - pad * 2) / spanA);
    const offL = (W - sc * spanL) / 2, offA = (H - sc * spanA) / 2;
    const X = l => offL + (l - minL) * sc;
    const Y = la => H - (offA + (la - minA) * sc);
    const ptsStr = pts.map(p => X(parseFloat(p[1])).toFixed(1) + "," + Y(parseFloat(p[0])).toFixed(1)).join(" ");
    return '<div style="text-align:center;margin:10px 0"><svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="max-width:320px;height:auto;border:1px solid #CBD4DF;border-radius:6px;background:#fff">' +
      '<polygon points="' + ptsStr + '" fill="rgba(234, 88, 12, 0.14)" stroke="#EA580C" stroke-width="2"/>' +
      '<text x="' + (W / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="#16202E" font-weight="600">Plotted land boundary · ≈ ' + C.fmtNum(Math.round(area || polygonAreaM2(pts))) + ' sqm</text></svg></div>';
  }

  function initAppraisalMap(id, lat, lng, onPin, polygon, onPlot, searchText) {
    if (!document.getElementById(id)) return;
    if (!window.L) { window.ESREALTY_LEAFLET.ensure().then(() => initAppraisalMap(id, lat, lng, onPin, polygon, onPlot, searchText)); return; }
    if (_mapRegistry[id]) { try { _mapRegistry[id].map.remove(); } catch (e) { /* noop */ } }
    const dark = (document.documentElement.getAttribute("data-theme") || "dark") === "dark";
    const tiles = dark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    const latN = parseFloat(lat), lngN = parseFloat(lng);
    const hasPin = isFinite(latN) && isFinite(lngN);
    const map = L.map(id, { center: hasPin ? [latN, lngN] : [13.0, 122.0], zoom: hasPin ? 14 : 5, scrollWheelZoom: true });
    L.tileLayer(tiles, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd", maxZoom: 19
    }).addTo(map);
    const entry = { map, marker: null, onPick: onPin, token: 0, deb: null, plotMode: "pin", points: [], poly: null, line: null };
    if (polygon && polygon.length) entry.points = polygon.map(p => [parseFloat(p[0]), parseFloat(p[1])]);
    _mapRegistry[id] = entry;

    const renderPlot = () => {
      if (entry.line) { map.removeLayer(entry.line); entry.line = null; }
      if (entry.poly) { map.removeLayer(entry.poly); entry.poly = null; }
      if (entry.points.length > 1) entry.line = L.polyline(entry.points, { color: "#f59e0b", weight: 2, dashArray: "5 5" }).addTo(map);
      if (entry.points.length >= 3) entry.poly = L.polygon(entry.points, { color: "#22c55e", weight: 2, fillColor: "#22c55e", fillOpacity: 0.15 }).addTo(map);
      plotStatus();
    };

    const plotStatus = () => {
      const box = document.getElementById(id + "-plot");
      if (!box) return;
      const n = entry.points.length;
      const btns = (extra) =>
        '<button class="btn btn-ghost btn-sm" id="' + id + '-undo" type="button">Undo</button> ' +
        '<button class="btn btn-ghost btn-sm" id="' + id + '-clear" type="button">Clear</button> ' +
        extra;
      if (n >= 3) {
        box.innerHTML = '<b>' + n + ' points</b> plotted &middot; area &asymp; <b>' + C.fmtNum(Math.round(polygonAreaM2(entry.points))) + ' sqm</b> ' +
          btns('<button class="btn btn-sm" id="' + id + '-done" type="button">Finish Plot</button>');
      } else if (n > 0) {
        box.innerHTML = '<b>' + n + ' point' + (n === 1 ? "" : "s") + '</b> plotted — click the remaining corners (3+ to close). ' + btns("");
      } else {
        box.innerHTML = '<span class="dim">No land plot yet — switch to <b>Plot Land</b> and click the corners of the property on the map.</span>';
      }
      const done = document.getElementById(id + "-done");
      if (done) done.addEventListener("click", () => {
        if (entry.points.length >= 3) {
          onPlot(entry.points.slice(), Math.round(polygonAreaM2(entry.points)));
          plotStatus();
        }
      });
      const undo = document.getElementById(id + "-undo");
      if (undo) undo.addEventListener("click", () => { entry.points.pop(); renderPlot(); });
      const clear = document.getElementById(id + "-clear");
      if (clear) clear.addEventListener("click", () => { entry.points = []; renderPlot(); });
    };

    map.on("click", e => {
      if (entry.plotMode === "plot") {
        entry.points.push([e.latlng.lat, e.latlng.lng]);
        renderPlot();
      } else {
        pinMap(id, e.latlng);
      }
    });

    const pinBtn = document.getElementById(id + "-pinmode"), plotBtn = document.getElementById(id + "-plotmode");
    const setMode = m => {
      entry.plotMode = m;
      if (pinBtn) pinBtn.classList.toggle("on", m === "pin");
      if (plotBtn) plotBtn.classList.toggle("on", m === "plot");
    };
    if (pinBtn) pinBtn.addEventListener("click", () => setMode("pin"));
    if (plotBtn) plotBtn.addEventListener("click", () => setMode("plot"));

    if (hasPin) {
      entry.marker = L.marker([latN, lngN], { draggable: true }).addTo(map);
      entry.marker.on("dragend", () => pinMap(id, entry.marker.getLatLng()));
      const c = document.getElementById(id + "-coords");
      if (c) c.innerHTML = "Pin: Latitude <b>" + esc(String(lat)) + "</b> &middot; Longitude <b>" + esc(String(lng)) + "</b>";
    }

    renderPlot();

    const q = document.getElementById(id + "-q"), btn = document.getElementById(id + "-btn");
    if (q && btn) {
      const go = () => searchMapOnPicker(id, q.value.trim());
      btn.addEventListener("click", go);
      q.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    }
    if (searchText) searchMapOnPicker(id, searchText);
    return entry;
  }

  /* ================= NAVIGATION ================= */
  function navigate(view) {
    if (currentUser && !navAllowed(view)) { toast("You do not have access to that view", "err"); return; }
    state.view = view;
    save();
    render();
  }
  function render() {
    if (currentUser && state && !navAllowed(state.view)) state.view = firstAllowedView();
    const playbookModal = document.getElementById("pb-modal");
    if (playbookModal && (!currentUser || !state || state.view !== "playbook" || !playbookAllowed())) playbookModal.remove();
    if (!currentUser) {
      const auth = $("#auth-screen");
      if (auth) auth.classList.add("hidden");
      $("#sidebar").classList.add("hidden");
      const topbar = document.querySelector(".topbar");
      if (topbar) topbar.classList.add("hidden");
      const main = document.querySelector(".main");
      if (main) main.classList.add("public-main");
      if (window.ESREALTY_STOREFRONT) {
        window.ESREALTY_STOREFRONT.mount({
          host: $("#content"),
          openAuth: mode => {
            showAuth();
            const tab = $(mode === "signup" ? "#auth-tab-register" : "#auth-tab-login");
            if (tab) tab.click();
          }
        });
      }
      return;
    }
    if (window.ESREALTY_STOREFRONT) window.ESREALTY_STOREFRONT.unmount();
    const main = document.querySelector(".main");
    if (main) main.classList.remove("public-main");
    hideAuth();
    const title = { dashboard: "Dashboard", wizard: "New Investment", deal: "Deal Analysis", portfolio: "Portfolio", pms: "Property Management", assistant: "AI Assistant", reports: "Reports", appraisal: "Appraisal", market: "Market Scan", listings: "Listings", leads: "CRM / Leads", transactions: "Transactions", financing: "Financing", presell: "Pre-Selling", portal: "Buyer Portal", playbook: "Sales Playbook", users: "Users & Access", admin: "Brokerage", settings: "Settings" };
    $("#topbar-title").textContent = (lang === "fil" ? (FIL_TITLES[state.view] || title[state.view]) : title[state.view]) || "ES Realty";
    $$("#nav .nav-item").forEach(b => b.classList.toggle("active", b.getAttribute("data-view") === state.view));
    $$("#nav .nav-item").forEach(b => {
      const view = b.getAttribute("data-view");
      b.classList.toggle("nav-hidden", !navAllowed(view) || ((roleIs("broker") || roleIs("owner") || roleIs("tenant")) && view === "dashboard"));
    });
    const langIndex = lang === "fil" ? 1 : 0;
    $$("#nav .nav-item").forEach(b => {
      const label = LANG_NAV[b.getAttribute("data-view")];
      const text = Array.prototype.slice.call(b.childNodes).find(n => n.nodeType === 3);
      if (label && text) text.nodeValue = " " + label[langIndex];
    });
    $$("#nav .nav-section").forEach(s => {
      const label = LANG_SECTIONS[s.getAttribute("data-section")];
      if (label) s.textContent = label[langIndex];
    });
    (() => {
      const nav = $("#nav");
      let current = null;
      let hasVisible = false;
      const hide = s => s.classList.toggle("nav-hidden", !hasVisible);
      Array.prototype.forEach.call(nav ? nav.children : [], el => {
        if (el.classList.contains("nav-section")) {
          if (current) hide(current);
          current = el;
          hasVisible = false;
        } else if (el.classList.contains("nav-item")) {
          if (current && !el.classList.contains("nav-hidden")) hasVisible = true;
        }
      });
      if (current) hide(current);
    })();
    const languageToggle = $("#language-toggle");
    if (languageToggle) { languageToggle.textContent = lang === "fil" ? "FIL" : "EN"; languageToggle.title = lang === "fil" ? "Switch to English" : "Lumipat sa Filipino"; }
    const content = $("#content");
    destroyMapPickers();
    const map = { dashboard: renderDashboard, wizard: renderWizard, deal: renderDeal, portfolio: renderPortfolio, pms: renderPMS, assistant: renderAssistant, reports: renderReports, appraisal: renderAppraisal, market: renderMarketScan, listings: renderListings, leads: renderLeads, transactions: renderTransactions, financing: renderFinancing, presell: renderPresell, portal: renderBuyerPortal, playbook: renderPlaybook, users: renderUsers, admin: renderAdmin, settings: renderSettings };
    content.innerHTML = map[state.view] ? map[state.view]() : "";
    updateDealPicker();
    fillIcons();
    bindPerView();
    updateSidebar();
    document.body.classList.remove("preload");
  }

  function showAuth() {
    const s = $("#auth-screen");
    s.classList.remove("hidden");
    $("#sidebar").classList.add("hidden");
  }
  function hideAuth() {
    $("#auth-screen").classList.add("hidden");
    $("#sidebar").classList.toggle("hidden", !currentUser);
  }

  function updateDealPicker() {
    const el = $("#deal-picker");
    if (!el) return;
    el.textContent = state.current ? "◈ " + (state.current.property.name || "Untitled") : "No deal loaded";
  }
  function updateSidebar() {
    const total = portfolioStats();
    const pv = $("#side-portfolio-value");
    const mini = pv ? pv.closest(".loan-mini") : null;
    if (mini) mini.style.display = canSeePortfolioValue() ? "" : "none";
    if (pv) pv.textContent = C.money(total.value);
    const av = $("#user-avatar");
    if (av) av.textContent = currentUser ? (currentUser.name || currentUser.email || "?").charAt(0).toUpperCase() : "?";
    const un = $("#user-name");
    if (un) un.textContent = currentUser ? (currentUser.name || currentUser.email || "Guest") : "Guest";
    const rs = $("#user-role-select");
    if (rs) rs.value = userRole();
    const tb = document.querySelector(".topbar");
    if (tb) tb.classList.remove("hidden");
    const picker = $("#deal-picker");
    const newDeal = $("#tb-new-deal");
    if (picker) picker.classList.toggle("hidden", !roleIs("super-admin"));
    if (newDeal) newDeal.classList.toggle("hidden", !roleIs("super-admin"));
  }

  /* ================= DEAL STATUS ================= */
  const DEAL_STATUSES = [
    { value: "negotiating", label: "Negotiating", color: "gold", note: "Still in talks — nothing committed." },
    { value: "acquired", label: "Acquired", color: "green", note: "Purchased — land/buildings held or being developed." },
    { value: "under construction", label: "Under Construction", color: "cyan", note: "Development in progress — costs are accruing." },
    { value: "for sale", label: "For Sale", color: "blue", note: "Listed for sale — counted at expected sale value." },
    { value: "sold", label: "Sold", color: "purple", note: "Disposed — profit counts toward realized Sold Profit." }
  ];
  function statusKey(s) { return String(s || "").trim().toLowerCase(); }
  function statusCfg(s) { return DEAL_STATUSES.find(x => x.value === statusKey(s)); }
  function statusBadge(s) {
    const cfg = statusCfg(s);
    return '<span class="badge ' + (cfg ? cfg.color : "cyan") + '">' + esc(cfg ? cfg.label : (s || "—")) + '</span>';
  }
  function statusSelect(d) {
    return '<select class="input st-select" data-status-deal="' + d.id + '">' +
      DEAL_STATUSES.map(s => '<option value="' + s.value + '"' + (statusKey(d.status) === s.value ? " selected" : "") + '>' + s.label + '</option>').join("") +
      '</select>';
  }
  function statusSummary() {
    const counts = {};
    state.deals.forEach(d => { const k = statusKey(d.status) || "—"; counts[k] = (counts[k] || 0) + 1; });
    return DEAL_STATUSES.map(s => '<span class="badge ' + s.color + '">' + s.label + " " + (counts[s.value] || 0) + "</span>").join(" ");
  }

  /* ================= PORTFOLIO STATS ================= */
  function dealValue(d) {
    try {
      const m = C.model(d.data);
      const growth = Math.pow(1 + m.property.growthRate, Math.min(5, d.data.sales.holdYears));
      if (statusKey(d.status) === "sold") return m.returns.netRevenue || m.acquisition.acquisitionCost;
      if (statusKey(d.status) === "for sale") return m.returns.totalDevCost * (1 + m.returns.roi * 0.8);
      return Math.max(m.acquisition.acquisitionCost, m.acquisition.acquisitionCost * growth * 0.7);
    } catch (e) { return 0; }
  }
  function portfolioStats() {
    let value = 0, loan = 0, cashflow = 0, invested = 0, soldProfit = 0;
    state.deals.forEach(d => {
      value += dealValue(d);
      const m = C.model(d.data);
      loan += m.acquisition.loanAmount;
      invested += m.acquisition.acquisitionCost + m.returns.totalDevCost;
      cashflow += d.data.sales.saleMode === "rent" ? m.returns.noi : m.returns.netRevenue;
      if (statusKey(d.status) === "sold") soldProfit += m.returns.profit;
    });
    return { value, loan, netWorth: value - loan, cashflow, invested, soldProfit, count: state.deals.length };
  }

  /* ================= AUTH ================= */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function fieldErr(id, msg) {
    const el = document.getElementById(id);
    const input = document.getElementById(id.replace("auth-err-", "auth-"));
    if (el) { el.textContent = msg; el.classList.add("show"); }
    if (input) input.classList.add("input-err");
  }
  function clearFieldErr(id) {
    const el = document.getElementById(id);
    const input = document.getElementById(id.replace("auth-err-", "auth-"));
    if (el) { el.textContent = ""; el.classList.remove("show"); }
    if (input) input.classList.remove("input-err");
  }
  function clearAllErrs() { ["auth-err-name", "auth-err-email", "auth-err-pass", "auth-err-confirm"].forEach(clearFieldErr); }
  function showFormMsg(html, type) {
    const m = $("#auth-form-msg");
    m.innerHTML = html;
    m.className = "auth-msg show " + (type === "ok" ? "ok" : "err");
  }
  function hideFormMsg() { const m = $("#auth-form-msg"); m.innerHTML = ""; m.className = "auth-msg"; }
  function bindAuth() {
    let mode = "signin";
    const title = $("#auth-title"), sub = $("#auth-submit"), nameField = $("#auth-name-field");
    const emailError = () => { const v = $("#auth-email").value.trim(); if (!v) return "Email is required."; return EMAIL_RE.test(v) ? "" : "Enter a valid email address, e.g. you@email.com."; };
    const passError = () => { const v = $("#auth-pass").value; if (!v) return "Password is required."; if (mode === "signup" && v.length < 6) return "Password must be at least 6 characters."; return ""; };
    const nameError = () => (mode !== "signup" ? "" : ($("#auth-name").value.trim() ? "" : "Full name is required."));
    const confirmError = () => { if (mode !== "signup") return ""; const v = $("#auth-confirm").value; if (!v) return "Confirm your password."; return v === $("#auth-pass").value ? "" : "Passwords do not match."; };
    const setMode = m => {
      mode = m;
      const signup = m === "signup";
      const forgot = m === "forgot";
      title.textContent = forgot ? "Reset your password" : (signup ? "Create your ES Realty account" : "Sign in to ES Realty");
      sub.textContent = forgot ? "Request Reset" : (signup ? "Create Account" : "Login");
      $("#auth-tab-login").classList.toggle("active", m === "signin");
      $("#auth-tab-register").classList.toggle("active", signup);
      $("#auth-tab-forgot").classList.toggle("active", forgot);
      nameField.style.display = signup ? "" : "none";
      $("#auth-confirm-field").style.display = signup ? "" : "none";
      $("#auth-request-role-field").style.display = signup ? "" : "none";
      $("#auth-pass-field").style.display = forgot ? "none" : "";
      $("#auth-role-field").style.display = !signup && !forgot && IS_LOCAL_DEV ? "" : "none";
      $("#auth-test").style.display = !signup && !forgot && IS_LOCAL_DEV ? "" : "none";
      $("#auth-links").style.display = (signup || forgot) ? "none" : "flex";
      $("#auth-back-links").style.display = forgot ? "flex" : "none";
      $("#auth-pass").autocomplete = signup ? "new-password" : "current-password";
      clearAllErrs();
      hideFormMsg();
    };
    $("#auth-note").textContent = IS_LOCAL_DEV ? "Local test mode is enabled. Production accounts use Supabase Auth." : "Your account role is assigned securely by ES Realty.";
    setMode("signin");
    const close = $("#auth-close");
    if (close) close.addEventListener("click", () => { hideAuth(); if (!currentUser) render(); });
    $("#auth-tab-login").addEventListener("click", () => setMode("signin"));
    $("#auth-tab-register").addEventListener("click", () => setMode("signup"));
    $("#auth-tab-forgot").addEventListener("click", () => setMode("forgot"));
    $("#auth-back-login").addEventListener("click", () => setMode("signin"));
    $("#auth-email").addEventListener("blur", () => { const err = emailError(); if (err) fieldErr("auth-err-email", err); });
    $("#auth-pass").addEventListener("blur", () => { const err = passError(); if (err) fieldErr("auth-err-pass", err); });
    $("#auth-name").addEventListener("blur", () => { const err = nameError(); if (err) fieldErr("auth-err-name", err); });
    $("#auth-confirm").addEventListener("blur", () => { const err = confirmError(); if (err) fieldErr("auth-err-confirm", err); });
    ["auth-email", "auth-pass", "auth-name", "auth-confirm"].forEach(id => {
      document.getElementById(id).addEventListener("input", () => clearFieldErr("auth-err-" + id.replace("auth-", "")));
    });
    const withTimeout = (promise, ms) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out — check your internet connection and try again.")), ms))
    ]);
    const sendEmailLink = async kind => {
      clearAllErrs();
      hideFormMsg();
      const email = $("#auth-email").value.trim();
      if (!email) { fieldErr("auth-err-email", "Enter your email address first."); $("#auth-email").focus(); return; }
      if (!EMAIL_RE.test(email)) { fieldErr("auth-err-email", "Enter a valid email address."); $("#auth-email").focus(); return; }
      try {
        if (!SB) throw new Error("Supabase client could not load");
        const { error } = await withTimeout(SB.auth.resend({ type: "signup", email }), 20000);
        if (error) throw error;
        showFormMsg("Confirmation link resent to <b>" + esc(email) + "</b> — check your inbox (and spam).", "ok");
      } catch (err) {
        const low = String(err.message || "").toLowerCase();
        if (/rate limit|too many/i.test(low)) showFormMsg("Too many requests — wait a while, then try again.", "err");
        else if (/not found|no user|no account|unconfirmed|invalid/i.test(low)) showFormMsg("No pending account found for that email. Make sure you registered first.", "err");
        else if (/querying schema|failed to fetch schema|database error/i.test(low)) showFormMsg("Please contact the administrator.", "err");
        else showFormMsg(esc(err.message || "Something went wrong. Please try again."), "err");
      }
    };
    $("#auth-forgot").addEventListener("click", () => setMode("forgot"));
    $("#auth-resend") && $("#auth-resend").addEventListener("click", () => sendEmailLink("resend"));
    $("#auth-form").addEventListener("submit", async e => {
      e.preventDefault();
      clearAllErrs();
      hideFormMsg();
      if (mode === "forgot") {
        const email = $("#auth-email").value.trim();
        if (!email) { fieldErr("auth-err-email", "Enter the email you registered with."); $("#auth-email").focus(); return; }
        if (!EMAIL_RE.test(email)) { fieldErr("auth-err-email", "Enter a valid email address."); $("#auth-email").focus(); return; }
        sub.disabled = true;
        sub.textContent = "Sending request…";
        try {
          if (!SB) throw new Error("Supabase client could not load");
          await withTimeout(SB.rpc("admin_request_password_reset", { p_email: email }), 20000);
          showFormMsg("If <b>" + esc(email) + "</b> has an ES Realty account, a password reset request was sent to the Super Admin. They will generate a new temporary password and share it with you.", "ok");
        } catch (err) {
          if (/could not load/i.test(String(err.message || ""))) showFormMsg("Local demo mode has no password reset. Contact your administrator.", "err");
          else if (/querying schema|failed to fetch schema|database error/i.test(String(err.message || ""))) showFormMsg("Please contact the administrator.", "err");
          else showFormMsg(esc(err.message || "Something went wrong. Please try again."), "err");
        } finally {
          sub.disabled = false;
          sub.textContent = "Request Reset";
        }
        return;
      }
      const firstBad = [["auth-err-name", nameError], ["auth-err-email", emailError], ["auth-err-pass", passError], ["auth-err-confirm", confirmError]]
        .filter(([, fn]) => fn()).map(([id, fn]) => { fieldErr(id, fn()); return id; })[0];
      if (firstBad) { const el = document.getElementById(firstBad.replace("auth-err-", "auth-")); if (el) el.focus(); return; }
      const email = $("#auth-email").value.trim();
      const pass = $("#auth-pass").value;
      const name = $("#auth-name").value.trim();
      const requestedRole = mode === "signup" ? $("#auth-request-role").value : "";
      sub.disabled = true;
      sub.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
      try {
        if (!SB) throw new Error("Supabase client could not load");
        let auth;
        if (mode === "signup") {
          auth = await withTimeout(SB.auth.signUp({ email, password: pass, options: { data: { full_name: name, requested_role: requestedRole } } }), 20000);
          if (auth.error) throw auth.error;
          if (!auth.data.session) {
            $("#auth-email").value = email;
            $("#auth-pass").value = "";
            $("#auth-confirm").value = "";
            setMode("signin");
            showFormMsg("Registration received! Check <b>" + esc(email) + "</b> to confirm your email, then log in. A Super Admin must approve your account before you can sign in.", "ok");
            $("#auth-email").focus();
            return;
          }
        } else {
          let supAuth = null;
          let supErr = null;
          if (SB) {
            try {
              supAuth = await withTimeout(SB.auth.signInWithPassword({ email, password: pass }), 20000);
              if (supAuth.error) supErr = supAuth.error;
            } catch (e) { supErr = e; }
          }
          if (supAuth && supAuth.data && supAuth.data.session) {
            currentUser = await withTimeout(loadSupabaseProfile(supAuth.data.user), 20000);
            await requireApprovedProfile(currentUser);
            await withTimeout(loadCurrentUserCloudState(), 20000);
            applyPostLoginView();
            toast("Welcome, <b>" + esc(currentUser.name || currentUser.email) + "</b>");
            await loadBrokerTeam();
            await loadCloudListings();
            await completePostAuthIntent();
            await loadCloudLeads();
            await loadCloudTransactions();
            await loadCloudPlaybooks();
            render();
            return;
          }
          let local = null;
          if (IS_LOCAL_DEV) {
            try {
              const list = JSON.parse(localStorage.getItem("esrealty_users") || "[]");
              local = list.find(u => String(u.email || "").toLowerCase() === email.toLowerCase());
            } catch (e) {}
          }
          const supErrMsg = supErr ? String(supErr.message || "").toLowerCase() : "";
          if (local && /invalid login credentials/i.test(supErrMsg)) {
            if (local.password && local.password !== pass) throw new Error("Wrong email or password");
            currentUser = { id: local.id || null, email: local.email, name: local.name || email.split("@")[0], role: local.role || "owner", createdAt: local.createdAt || Date.now() };
            saveUser(currentUser);
            if (!navAllowed(state.view)) state.view = firstAllowedView();
            save();
            toast("Welcome, <b>" + esc(currentUser.name || currentUser.email) + "</b>");
            if (sessionStorage.getItem("esrealty_post_auth_favorite")) state.view = navAllowed("dashboard") ? "dashboard" : state.view;
            render();
            return;
          }
          if (supErr) throw supErr;
          throw new Error("Invalid login credentials");
        }
        currentUser = await withTimeout(loadSupabaseProfile(auth.data.user), 20000);
        await requireApprovedProfile(currentUser);
        await withTimeout(loadCurrentUserCloudState(), 20000);
        applyPostLoginView();
        toast("Welcome, <b>" + esc(currentUser.name || currentUser.email) + "</b>");
        await loadBrokerTeam();
        await loadCloudListings();
        await completePostAuthIntent();
        await loadCloudLeads();
        await loadCloudTransactions();
        await loadCloudPlaybooks();
        render();
      } catch (e) {
        const low = String(e.message || "").toLowerCase();
        if (/email not confirmed/.test(low)) {
          fieldErr("auth-err-email", "This email is not confirmed yet.");
          showFormMsg("Check your inbox (and spam) for the confirmation link, then log in.", "err");
        } else if (/invalid login credentials/.test(low)) {
          showFormMsg("Wrong email or password.", "err");
        } else if (/already registered|already exist/i.test(low)) {
          fieldErr("auth-err-email", "This email is already registered.");
          showFormMsg("Try logging in, or use a different email to register.", "err");
        } else if (/pending.*approval|registration is pending/i.test(low)) {
          showFormMsg("Your registration is pending Admin approval. You'll be able to log in once approved.", "err");
        } else if (/rejected/.test(low)) {
          showFormMsg("Your registration was rejected. Contact the Super Admin to resolve this.", "err");
        } else if (/rate limit|too many|throttled/i.test(low)) {
          showFormMsg("Too many signup attempts. Wait about an hour, then try again.", "err");
        } else if (/at least 6 characters/.test(low)) {
          fieldErr("auth-err-pass", "Password must be at least 6 characters.");
        } else if (/querying schema|failed to fetch schema|database error/i.test(low)) {
          showFormMsg("Please contact the administrator.", "err");
        } else {
          showFormMsg(esc(e.message || "Something went wrong. Please try again."), "err");
        }
      } finally {
        sub.disabled = false;
        sub.textContent = mode === "signup" ? "Create Account" : "Login";
        if (mode === "signup" && !currentUser) {
          let left = 10;
          sub.disabled = true;
          const tick = () => {
            sub.textContent = "Retry in " + left + "s";
            if (--left < 0) { sub.disabled = false; sub.textContent = "Create Account"; }
            else setTimeout(tick, 1000);
          };
          setTimeout(tick, 0);
        }
      }
    });
    $("#auth-test").addEventListener("click", () => {
      if (!IS_LOCAL_DEV) return;
      const u = { email: "demo@esrealty.ph", name: "Demo User", role: $("#auth-role").value, createdAt: Date.now(), demo: true };
      let users = [];
      try { users = JSON.parse(localStorage.getItem("esrealty_users") || "[]"); } catch (e) {}
      if (!users.find(x => x.email.toLowerCase() === u.email)) { users.push(u); localStorage.setItem("esrealty_users", JSON.stringify(users)); }
      currentUser = u;
      saveUser(u);
      remoteProfiles = [];
      remoteProfilesLoaded = false;
      if (!navAllowed(state.view)) applyPostLoginView();
      toast("Test login — welcome <b>" + esc(u.name) + "</b>");
      render();
    });
    $("#btn-signout").addEventListener("click", async () => {
      clearTimeout(remoteSaveTimer);
      clearTimeout(pmsSaveTimer);
      remoteSaveTimer = null;
      pmsSaveTimer = null;
      let signOutError = null;
      try { if (SB && currentUser && currentUser.id) { const result = await SB.auth.signOut(); signOutError = result.error; } } catch (e) { signOutError = e; }
      if (signOutError && SB && SB.auth) {
        try { await SB.auth.signOut({ scope: "local" }); } catch (e) {}
      }
      currentUser = null;
      brokerTeamCache = null;
      brokerTeamList = [];
      brokerTeamStatus = "idle";
      linkedBroker = null;
      linkedBrokerStatus = "idle";
      cloudSavedListings = [];
      cloudMyListings = [];
      localStorage.removeItem(AUTH_KEY);
      render();
      if (signOutError) toast("Signed out locally. The remote session could not be closed.", "err");
    });
    const roleSelect = $("#user-role-select");
    roleSelect.disabled = !IS_LOCAL_DEV;
    $("#user-role-label").textContent = IS_LOCAL_DEV ? "Test role" : "Role";
    if (roleSelect) roleSelect.addEventListener("change", () => {
      if (!IS_LOCAL_DEV) return;
      if (!currentUser) return;
      currentUser.role = roleSelect.value;
      brokerTeamCache = null;
      saveUser(currentUser);
      toast("Role → <b>" + esc(roleLabel(roleSelect.value)) + "</b>");
      render();
    });
  }
  let authStateBound = false;
  async function bindAuthState() {
    if (authStateBound) return;
    if (!(await sbUp()) || !SB || !SB.auth || !SB.auth.onAuthStateChange) return;
    if (authStateBound) return;
    authStateBound = true;
    SB.auth.onAuthStateChange(event => {
      if (event !== "SIGNED_OUT" || !currentUser) return;
      currentUser = null;
      cloudSavedListings = [];
      cloudMyListings = [];
      brokerTeamCache = null;
      brokerTeamList = [];
      localStorage.removeItem(AUTH_KEY);
      notifReset();
      state = loadState();
      render();
    });
  }

  /* ================= GLOBAL BINDINGS ================= */
  function bindGlobal() {
    fillIcons();
    bindNumFormatting();
    $("#nav").addEventListener("click", e => {
      const b = e.target.closest(".nav-item");
      if (b) { $("#sidebar").classList.remove("open"); navigate(b.getAttribute("data-view")); }
    });
    $("#menu-btn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
    $("#theme-toggle").addEventListener("click", () => {
      state.theme = "light";
      document.documentElement.setAttribute("data-theme", "light");
      save();
    });
    const languageToggle = $("#language-toggle");
    if (languageToggle) languageToggle.addEventListener("click", toggleLang);
    $("#tb-new-deal").addEventListener("click", () => {
      state.current = freshDeal();
      state.wizardStep = 1;
      save();
      navigate("wizard");
    });
    $("#sidebar").addEventListener("click", e => {
      if (e.target.closest("[data-view]")) $("#sidebar").classList.remove("open");
    });
    document.addEventListener("click", e => {
      const vaultSave = e.target.closest("[data-vault-save]");
      if (vaultSave) { vaultSaveDoc(); return; }
      const vaultCancel = e.target.closest("[data-vault-cancel]");
      if (vaultCancel) { closeVault(); return; }
      const vaultDeleteBtn = e.target.closest("[data-vault-del]");
      if (vaultDeleteBtn) { vaultDelete(vaultDeleteBtn.getAttribute("data-vault-del")); return; }
      const vaultOpenBtn = e.target.closest("[data-vault-open]");
      if (vaultOpenBtn) { vaultOpenDoc(vaultOpenBtn.getAttribute("data-vault-open")); return; }
      const vaultDownloadBtn = e.target.closest("[data-vault-download]");
      if (vaultDownloadBtn) { vaultDownloadDoc(vaultDownloadBtn.getAttribute("data-vault-download")); return; }
    });
    document.addEventListener("change", e => {
      if (e.target && e.target.id === "vl-file") vaultFileSelected(e.target);
    });
  }

  let cbBound = false;
  function bindCobrokeOnce() {
    if (cbBound) return; cbBound = true;
    document.addEventListener("click", async e => {
      const q = s => e.target.closest(s);
      if (q("[data-cb-new]")) { openCobrokeModal(); return; }
      if (q("[data-cb-cancel]")) { closeCbModal(); return; }
      if (q("[data-cb-propose]")) { await proposeCobroke(); return; }
      const acc = q("[data-cb-accept]");
      if (acc) { await setCobrokeStatus(acc.getAttribute("data-cb-accept"), "accepted"); return; }
      const dec = q("[data-cb-decline]");
      if (dec) { await setCobrokeStatus(dec.getAttribute("data-cb-decline"), "declined"); return; }
      const comp = q("[data-cb-complete]");
      if (comp) { await setCobrokeStatus(comp.getAttribute("data-cb-complete"), "completed"); return; }
      const can = q("[data-cb-cancel]");
      if (can) { if (confirm("Cancel this proposal?")) await setCobrokeStatus(can.getAttribute("data-cb-cancel"), "cancelled"); return; }
    });
  }

function bindPerView() {
    bindCobrokeOnce();
    bindPresellOnce();
    $$("#content [data-view]").forEach(b => b.addEventListener("click", () => navigate(b.getAttribute("data-view"))));
    $$("#content [data-step]").forEach(b => b.addEventListener("click", () => { state.wizardStep = +b.getAttribute("data-step"); save(); render(); }));
    $$("#content [data-open-deal]").forEach(b => b.addEventListener("click", () => {
      const d = state.deals.find(x => x.id === b.getAttribute("data-open-deal"));
      if (d) { state.current = JSON.parse(JSON.stringify(d.data)); save(); navigate("deal"); }
    }));
    $$("#content [data-edit-deal]").forEach(b => b.addEventListener("click", () => {
      const d = state.deals.find(x => x.id === b.getAttribute("data-edit-deal"));
      if (d) { state.current = JSON.parse(JSON.stringify(d.data)); state.wizardStep = 1; save(); navigate("wizard"); toast("Editing <b>" + esc(d.data.property.name) + "</b> in the wizard"); }
    }));
    $$("#content [data-delete-deal]").forEach(b => b.addEventListener("click", () => {
      const id = b.getAttribute("data-delete-deal");
      const d = state.deals.find(x => x.id === id);
      if (d && confirm('Delete "' + d.data.property.name + '" from portfolio?')) {
        state.deals = state.deals.filter(x => x.id !== id);
        save(); render(); toast("Deal deleted", "err");
      }
    }));
    $$("#content [data-status-deal]").forEach(sel => sel.addEventListener("change", () => {
      const d = state.deals.find(x => x.id === sel.getAttribute("data-status-deal"));
      if (d && statusKey(sel.value) !== statusKey(d.status)) {
        const prev = d.status;
        d.status = sel.value;
        save(); render();
        const cfg = statusCfg(d.status);
        toast("Status → <b>" + esc(cfg ? cfg.label : d.status) + "</b>" + (cfg ? '<div class="dim tiny">' + esc(cfg.note) + "</div>" : ""));
      }
    }));
    if (state.view === "wizard") bindWizard();
    if (state.view === "assistant") bindAssistant();
    if (state.view === "deal") bindDealContent();
    if (state.view === "reports") bindReports();
    if (state.view === "appraisal") bindAppraisal();
    if (state.view === "market") bindMarketScan();
    if (state.view === "pms") bindPMS();
    if (state.view === "listings" || state.view === "dashboard") bindListings();
    if (state.view === "leads") bindLeads();
    if (state.view === "transactions") bindTransactions();
    if (state.view === "financing") bindFinancing();
    if (state.view === "playbook") bindPlaybook();
    if (state.view === "dashboard" && roleIs("super-admin")) bindSiteContact();
    if (state.view === "users") bindUsers();
    if (state.view === "admin") bindAdmin();
    if (state.view === "settings") bindSettings();
  }

  /* ================= WIZARD ================= */
  const STEPS = ["Property", "Location", "Purchase", "Financing", "Development", "Sales", "Comparable Sales/rental"];

  function wfield(label, inner, hint) {
    return '<div class="field col-3"><label>' + label + '</label>' + inner + (hint ? '<div class="field-hint">' + hint + '</div>' : "") + '</div>';
  }
  function numInp(name, val, suffix) {
    return '<div class="input-suffix"><input class="input input-num" data-g="' + name + '" value="' + C.fmtNum(val) + '" inputmode="decimal" autocomplete="off" placeholder="0">' + (suffix ? "<span>" + suffix + "</span>" : "") + '</div>';
  }
  function txtInp(name, val, ph) { return '<input class="input" data-g="' + name + '" value="' + esc(val == null ? "" : val) + '" placeholder="' + (ph || "") + '">'; }
  function selInp(name, val, options) {
    return '<select class="input" data-g="' + name + '">' + options.map(o => { const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (v === val ? " selected" : "") + '>' + esc(l) + '</option>'; }).join("") + '</select>';
  }

  function regionSel(cur) {
    return '<select class="input" id="wz-region" data-g="property.region"><option value="">Select region…</option>' +
      D.PH_REGIONS.map(r => '<option value="' + esc(r[0]) + '"' + (r[0] === cur ? " selected" : "") + '>' + esc(r[0]) + '</option>').join("") + '</select>';
  }
  function provinceSel(region, cur) {
    const r = D.PH_REGIONS.find(x => x[0] === region);
    const provs = r ? r[1] : [];
    return '<select class="input" id="wz-province" data-g="property.province"><option value="">Select province…</option>' +
      provs.map(p => '<option value="' + esc(p) + '"' + (p === cur ? " selected" : "") + '>' + esc(p) + '</option>').join("") + '</select>';
  }
  function citySel(region, province, cur) {
    const cities = (region && province) ? D.citiesFor(region, province) : [];
    return '<select class="input" id="wz-city" data-g="property.city"><option value="">Select city / municipality…</option>' +
      cities.map(c => '<option value="' + esc(c) + '"' + (c === cur ? " selected" : "") + '>' + esc(c) + '</option>').join("") + '</select>';
  }

  const PROPERTY_IMPROVEMENT_TYPES = ["House & Lot", "Condominium Unit", "Commercial", "Industrial"];
  const STRUCTURE_TYPES = ["House", "Townhouse", "Condominium", "Commercial Building", "Office Building", "Industrial Building", "Warehouse", "Mixed Use", "Others"];
  const STRUCTURE_CONDITIONS = ["Excellent", "Good", "Average", "Fair", "Needs Repair", "Under Construction"];
  const MIXED_USE_STRUCTURES = ["Residential", "Retail / Commercial", "Office", "Warehouse", "Parking", "Hotel / Lodging", "Storage", "Institutional"];
  function pHasImprovement(t) { return PROPERTY_IMPROVEMENT_TYPES.indexOf(t) !== -1; }

  /* Per-step validation — returns a list of human-readable problems, empty = OK */
  function wizardErrors(step, d) {
    const p = d.property, errs = [];
    if (step === 1) {
      if (!String(p.name || "").trim()) errs.push("Property Name is required.");
      if (!(C.num(p.lotArea, 0) > 0)) errs.push("Lot Area must be greater than 0 sqm.");
    }
    if (step === 2) {
      const hasCity = String(p.city || "").trim();
      const hasCoords = isFinite(C.num(p.lat, NaN)) && isFinite(C.num(p.lng, NaN));
      if (!hasCity && !hasCoords) errs.push("Select a City / Municipality (or drop a map pin) so location benchmarks can be computed.");
    }
    if (step === 3) {
      if (!(C.num(d.purchase.price, 0) > 0)) errs.push("Purchase Price must be greater than 0.");
    }
    if (step === 5) {
      const dev = d.development;
      if (dev.devType === "Subdivision") {
        if (!(C.num(dev.lots, 0) > 0)) errs.push("Number of Residential Lots is required for a Subdivision.");
      } else if (dev.devType !== "Vacant Lot") {
        if (!(C.num(dev.floorArea, 0) > 0)) errs.push("Buildable Floor Area must be greater than 0 for " + esc(dev.devType) + ".");
      }
    }
    if (step === 6) {
      const s = d.sales;
      const isSell = s.saleMode === "sell" || s.saleMode === "hybrid";
      const isRent = s.saleMode === "rent" || s.saleMode === "hybrid";
      if (isSell && !(C.num(s.sellPricePerSqm, 0) > 0)) errs.push("Selling Price / sqm must be greater than 0 for a Develop & Sell plan.");
      if (isRent && !(C.num(s.rentalRatePerSqm, 0) > 0)) errs.push("Rental Rate / sqm must be greater than 0 for a Buy & Hold plan.");
    }
    return errs;
  }
  function syncWizardValidation(d) {
    const errs = wizardErrors(state.wizardStep, d);
    const next = $("#wz-next");
    if (next) next.disabled = errs.length > 0;
    const box = $("#wz-errs");
    if (box) {
      box.style.display = errs.length ? "" : "none";
      box.innerHTML = errs.length ? '<b>' + icon("zap", 13) + ' Fix before continuing:</b><ul>' + errs.map(e => "<li>" + e + "</li>").join("") + "</ul>" : "";
    }
  }
  /* What-if slider — drives a numeric wizard field and updates live */
  function wSlider(label, dataG, min, max, step) {
    const id = "wz-sl-" + dataG.replace(/\./g, "-");
    return '<div class="field col-6"><label>' + label + ' <span class="dim" id="' + id + '-val"></span></label>' +
      '<input class="wslider" type="range" min="' + min + '" max="' + max + '" step="' + step + '" id="' + id + '" data-sl="' + dataG + '"></div>';
  }
  /* Candidate comparables pulled from saved portfolio deals + appraisals */
  function buildComparableSuggestions() {
    const out = [];
    state.deals.forEach(dd => {
      const data = dd.data;
      const m = C.model(data);
      const est = Math.round(m.estMarketValue);
      if (est > 0) {
        out.push({ id: "sug-deal-" + dd.id, label: data.property.name + " — " + (data.property.city || "PH") + " (est. ₱" + C.numFmt(est) + ")", comp: { type: "Sale", address: data.property.address || data.property.name, city: data.property.city, price: est, floorArea: data.property.existingFloorArea || 0, lotArea: data.property.lotArea || 0, date: "", source: "Portfolio", propertyType: data.property.propertyType, improvement: data.property.structureType || "None" } });
      }
    });
    state.appraisals.forEach(a => {
      (a.comparables || []).forEach((c, i) => {
        if (!c || !C.num(c.price, 0)) return;
        out.push({ id: "sug-appr-" + a.id + "-" + i, label: (a.name || "Appraisal") + " · " + (c.address || "comp " + (i + 1)) + " — ₱" + C.numFmt(c.price), comp: { type: c.transactionType === "Rental" ? "Rental" : "Sale", address: c.address, city: c.city, price: c.price, floorArea: c.floorArea || 0, lotArea: c.lotArea || 0, date: c.saleDate || "", source: c.source || "Appraisal", propertyType: c.propertyType || "", improvement: "None" } });
      });
    });
    return out;
  }

  function renderWizard() {
    const d = state.current || freshDeal();
    const p = d.property;
    const step = state.wizardStep;
    let html = '<div class="wizard-steps">';
    STEPS.forEach((s, i) => {
      const n = i + 1;
      html += '<button class="wstep ' + (n === step ? "active" : n < step ? "done" : "") + '" data-step="' + n + '"><span class="n">' + n + '</span>' + s + '</button>';
    });
    html += "</div>";
    const pct = Math.round((step - 1) / STEPS.length * 100);
    html += '<div class="wizard-status"><span class="dim tiny" id="wz-progress">Step ' + step + ' of ' + STEPS.length + ' · ' + pct + '% complete</span>' +
      '<span class="dim tiny" id="wz-save-status">' + icon("check", 11) + ' Draft autosaved</span></div>';
    html += '<div class="card card-pad"><div class="row spread mb-16"><h3 class="mb-16" style="margin:0">' + STEPS[step - 1] + ' Information</h3><button class="btn btn-ghost btn-sm" id="wz-cancel">' + icon("trash", 13) + ' Cancel Draft</button></div><div class="form-grid">';

    if (step === 1) {
      html += '<div class="field col-12"><label>Property Name</label>' + txtInp("property.name", p.name, "e.g. Acacia Heights Residential Lot") + '</div>';
      html += wfield("Lot Area", numInp("property.lotArea", p.lotArea, "sqm")) +
        wfield("Frontage", numInp("property.frontage", p.frontage, "m")) +
        wfield("Depth", numInp("property.depth", p.depth, "m")) +
        wfield("Road Width", numInp("property.roadWidth", p.roadWidth, "m")) +
        wfield("Road Type", selInp("property.roadType", p.roadType, ["National Highway", "Provincial Road", "City / Municipal Road", "Barangay Road", "Private Road"])) +
        wfield("Property Type", selInp("property.propertyType", p.propertyType, D.PROPERTY_TYPES)) +
        wfield("Current Land Use", selInp("property.landUse", p.landUse, ["Residential", "Commercial", "Industrial", "Agricultural", "Mixed"])) +
        wfield("Zoning", selInp("property.zoning", p.zoning, ["Residential", "Commercial", "Industrial", "Agricultural", "Mixed"])) +
        wfield("Flood Risk", selInp("property.floodRisk", p.floodRisk, ["None", "Low", "Medium", "High"])) +
        (pHasImprovement(p.propertyType) ?
          '<div class="field col-12"><div class="section-label">' + icon("home", 12) + ' Improvement on the property — existing structure</div></div>' +
          wfield("Structure Type", selInp("property.structureType", p.structureType, STRUCTURE_TYPES)) +
          (p.structureType === "Mixed Use" ?
            '<div class="field col-12"><label>Mixed-Use Components</label><div class="opt-row">' +
            MIXED_USE_STRUCTURES.map(s => '<button type="button" class="opt' + ((p.structures || []).indexOf(s) !== -1 ? " on" : "") + '" data-struct="' + esc(s) + '">' + esc(s) + '</button>').join("") +
            '</div><div class="field-hint">Select 2 or more structures that make up the property.</div></div>'
            : "") +
          wfield("Year Built", numInp("property.yearBuilt", p.yearBuilt, "")) +
          wfield("Number of Floors", numInp("property.floors", p.floors)) +
          wfield("Existing Floor Area", numInp("property.existingFloorArea", p.existingFloorArea, "sqm")) +
          wfield("Condition", selInp("property.condition", p.condition, STRUCTURE_CONDITIONS)) +
          wfield("Improvement Value", numInp("property.improvementValue", p.improvementValue, "₱")) +
          wfield("Income-Generating", selInp("property.incomeGenerating", p.incomeGenerating, ["No", "Yes"])) +
          (p.incomeGenerating === "Yes" ? wfield("Monthly Income", numInp("property.monthlyIncome", p.monthlyIncome, "₱/mo")) : "") +
          '<div class="field col-12"><div class="ai-banner">' + icon("spark", 14) + ' <span>This property carries an existing <b>improvement</b> — the appraisal will value land and structure separately.</span></div></div>'
          :
          '<div class="field col-12"><div class="ai-banner">' + icon("spark", 14) + ' <span><b>' + esc(p.propertyType || "Vacant Lot") + '</b> — no building improvement on the property. Construction is handled in the <b>Development</b> step.</span></div></div>'
        ) +
        '<div class="field col-12"><label>Utilities Available</label><div class="opt-row">' +
        D.UTILITIES.map(u => '<button class="opt' + (p.utilities[u] ? " on" : "") + '" data-util="' + u + '">' + u + '</button>').join("") + '</div></div>';
    }

    if (step === 2) {
      html += wfield("Region", regionSel(p.region), "") +
        wfield("Province", provinceSel(p.region, p.province), "") +
        wfield("City / Municipality", citySel(p.region, p.province, p.city), "") +
        wfield("Barangay", txtInp("property.barangay", p.barangay), "") +
        '<div class="field col-12"><label>Complete Address</label>' + txtInp("property.address", p.address, "Street, Barangay, City, Province") + '</div>';
      html += mapPickerHtml("wz-map", p.lat, p.lng);
      html += '<div class="field col-12"><div class="map-tools"><button type="button" class="btn" id="wz-ai-loc">' + icon("spark", 14) + ' Analyze Location from Map</button>' +
        '<span class="dim tiny" id="wz-ai-loc-status">Drop a pin, then analyze to validate the address and scan nearby establishments (OpenStreetMap).</span></div></div>' +
        (d.location.analysis ? '<div class="field col-12"><div class="notice-banner"><span>' + icon("check", 14) + ' <b>Last map analysis:</b> ' + esc(d.location.analysis.address || "Address could not be resolved") + ' · ' + C.num(d.location.analysis.typesFound, 0) + ' nearby establishment type(s) found · ' + esc(new Date(d.location.analysis.analyzedAt).toLocaleString()) + '</span></div></div>' : "");
      html += '<div class="field col-12"><label>Nearby Establishments (within ~1 km)</label><div class="opt-row">' +
        D.NEARBY_TYPES.map(n => '<button class="opt' + (d.location.nearby[n] ? " on" : "") + '" data-near="' + n + '">' + n + '</button>').join("") + '</div></div>';
      html += '<div class="field col-12"><div class="field-hint">Analyze Location from Map refreshes these establishment flags and the six location assessments below. You can still refine any result manually.</div></div>';
      html += wfield("Accessibility (0-100)", numInp("location.accessibilityScore", d.location.accessibilityScore)) +
        wfield("Traffic Load (0-100)", numInp("location.trafficScore", d.location.trafficScore)) +
        wfield("Population Score (0-100)", numInp("location.populationScore", d.location.populationScore)) +
        wfield("Future Development (0-100)", numInp("location.futureDevScore", d.location.futureDevScore)) +
        wfield("Competition (0-100)", numInp("location.competitionScore", d.location.competitionScore)) +
        wfield("Commercial Growth (0-100)", numInp("location.commercialGrowthScore", d.location.commercialGrowthScore));
      html += '<div class="field col-12"><div class="ai-banner mt-8">' + icon("spark", 14) + ' <span><b>AI Location Analysis</b> — press <b>Analyze Location from Map</b> above to reverse-geocode the pin (auto-fills Region/Province/City/Barangay) and detect nearby establishments via OpenStreetMap; the scores below are then computed from the results. In production this runs on Google Places + OpenAI.</span></div></div>';
    }

    if (step === 3) {
      const b = d.purchase;
      html += wfield("Purchase Price", numInp("purchase.price", b.price, "₱")) +
        wfield("Negotiated Price", numInp("purchase.negotiatedPrice", b.negotiatedPrice, "₱")) +
        wfield("Price per sqm (auto)", '<input class="input input-num" id="wz-pricepsm" readonly disabled value="">') +
        wfield("Seller Type", selInp("purchase.sellerType", b.sellerType, ["Owner", "Broker", "Developer", "Bank Foreclosed", "Auction"])) +
        wfield("Taxes", numInp("purchase.taxes", b.taxes, "₱")) +
        wfield("Transfer Fees", numInp("purchase.transferFees", b.transferFees, "₱")) +
        wfield("Legal Fees", numInp("purchase.legalFees", b.legalFees, "₱")) +
        wfield("Survey Cost", numInp("purchase.surveyCost", b.surveyCost, "₱")) +
        wfield("Misc Costs", numInp("purchase.miscCost", b.miscCost, "₱")) +
        '<div class="field col-12"><div class="fin-preview"><div class="dim tiny">Total closing costs &amp; cash outlay</div><div class="mono" id="wz-fees" style="font-size:16px;font-weight:700;margin-top:4px">₱0</div></div></div>';
    }

    if (step === 4) {
      const f = d.financing;
      html += wfield("Financing Type", selInp("financing.type", f.type, ["Cash", "Bank Loan", "Pag-IBIG", "Private Investor", "Joint Venture", "Seller Financing"])) +
        wfield("Loan % of Purchase Price", numInp("financing.loanPct", f.loanPct, "%")) +
        wfield("Interest Rate", numInp("financing.interestRate", f.interestRate, "%/yr")) +
        wfield("Term", numInp("financing.years", f.years, "yrs"));
      html += '<div class="field col-12"><div class="fin-preview"><div class="dim tiny">Auto-calculated financing</div>' +
        '<div class="grid grid-4 mt-8">' +
        miniStat("Loan Amount", 'id="fin-loan"') +
        miniStat("Monthly Amortization", 'id="fin-monthly"') +
        miniStat("Total Interest", 'id="fin-interest"') +
        miniStat("Equity Required", 'id="fin-equity"') +
        '</div></div></div>';
      html += '<div class="field col-12"><div class="fin-preview"><div class="dim tiny">Loan eligibility check (bank LTV caps · Pag-IBIG ₱6.0M ceiling)</div><div class="mono" id="wz-loan-elig" style="font-size:13px;font-weight:600;margin-top:4px">—</div></div></div>';
    }

    if (step === 5) {
      const dd = d.development;
      const set = DEV_FIELD_SETS[dd.devType] || DEV_FIELD_SETS.Townhouse;
      html += wfield("Development Goal", selInp("development.goal", dd.goal || "custom", DEVELOPMENT_GOALS)) +
        wfield("Development Type", selInp("development.devType", dd.devType, D.DEV_TYPES)) +
        '<div class="field col-12"><div class="fin-preview"><div class="dim tiny">Lot Size from Location Information</div><div class="mono" id="wz-dev-lot" style="font-size:15px;font-weight:700;margin-top:4px">' + C.numFmt(C.num(d.property.lotArea, 0)) + ' sqm</div><div class="field-hint">Selecting a development type or goal automatically sizes the initial build plan from this lot area. You can refine the values below.</div></div></div>';
      if (set.fields.length) {
        html += '<div class="field col-12"><div class="section-label">' + icon("layers", 12) + ' ' + esc(set.title) + '</div></div>' +
          set.fields.map(f => wfield(f[1], numInp("development." + f[0], dd[f[0]], f[2]))).join("");
      }
      if (dd.devType === "Townhouse") {
        html += '<div class="field col-12"><div class="fin-preview"><div class="dim tiny">Townhouse construction cost per unit (auto)</div><div class="mono" id="wz-cost-unit" style="font-size:15px;font-weight:700;margin-top:4px">Enter unit count</div><div class="field-hint">Total construction cost divided by the number of townhouse units; excludes permits, contingency, marketing, and financing.</div></div></div>';
      }
      if (dd.devType !== "Vacant Lot" && dd.devType !== "Subdivision") {
        html += '<div class="field col-12"><div class="fin-preview"><div class="dim tiny">Build size compared with your lot (auto)</div><div class="mono" id="wz-far" style="font-size:15px;font-weight:700;margin-top:4px">Enter total floor area</div><div class="field-hint">We calculate this automatically: total floor area to build ÷ lot area. Confirm the allowed building size with your architect and LGU.</div></div></div>';
      }
      html += '<div class="field col-12"><div class="ai-banner mt-8">' + icon("spark", 14) + ' <span>' + set.note + '</span></div></div>' +
        '<div class="field col-12"><div class="section-label">' + icon("dollar", 12) + ' Other costs &amp; contingency</div></div>' +
        wfield("Permit Fees", numInp("development.permits", dd.permits, "₱")) +
        wfield("Contingency (%)", numInp("development.contingencyPct", dd.contingencyPct, "%")) +
        wfield("Amenities Budget", numInp("development.amenities", dd.amenities, "₱")) +
        wfield("Marketing Budget", numInp("development.marketing", dd.marketing, "₱")) +
        wfield("Carrying Cost / month", numInp("development.carryingMonthly", dd.carryingMonthly, "₱/mo")) +
        '<div class="field col-12"><p class="dim tiny">Carrying cost covers property tax (RPT), insurance, security and utilities while the project is being built — applied over ' + C.numFmt(dd.buildMonths || 0) + ' months.</p></div>' +
        '<div class="field col-12"><div class="fin-preview"><div class="dim tiny">Development cost breakdown (auto)</div><div class="mono" id="wz-dev" style="font-size:15px;font-weight:700;margin-top:4px">₱0</div></div></div>' +
        '<div class="field col-12"><div class="section-label">' + icon("target", 12) + ' Project Budget</div></div>' +
        wfield("Planned Project Budget", numInp("development.projectBudget", dd.projectBudget, "₱")) +
        '<div class="field col-12"><div class="fin-preview"><div class="dim tiny">Auto-computed estimate — land acquisition + development + financing</div>' +
        '<div class="grid grid-2 mt-8">' +
        miniStat("Estimated Project Budget", 'id="wz-budget"') +
        miniStat("Variance (Budget − Estimate)", 'id="wz-budget-diff"') +
        '</div></div></div>';
    }

    if (step === 6) {
      const s = d.sales;
      const salesProfile = developmentSalesProfile(d.development.devType, d.development.goal);
      const goalLabel = (DEVELOPMENT_GOALS.find(x => x[0] === (d.development.goal || "custom")) || DEVELOPMENT_GOALS[0])[1];
      const lguTransferTax = (d.property.region === "NCR" || d.property.province === "Metro Manila") ? 0.75 : 0.5;
      const isSell = s.saleMode === "sell" || s.saleMode === "hybrid";
      const isRent = s.saleMode === "rent" || s.saleMode === "hybrid";
      html += '<div class="field col-12"><div class="fin-preview" id="wz-sales-plan"><div class="row spread"><div><div class="dim tiny">Sales plan from Development Information</div><div class="mono" style="font-size:15px;font-weight:700;margin-top:4px">' + esc(goalLabel) + ' · ' + esc(d.development.devType) + ' · ' + esc(salesProfile.saleMode === "sell" ? "Develop & Sell" : salesProfile.saleMode === "rent" ? "Buy & Hold / Rent" : "Hybrid") + '</div></div><button type="button" class="btn btn-ghost btn-sm" id="wz-sync-sales">Sync plan</button></div><div class="field-hint" id="wz-sales-basis">Development basis: ' + esc(developmentSalesSummary(d)) + '. Sync restores the recommended sale mode and unit count; assumptions below remain editable.</div></div></div>' +
        wfield("Sale Mode", selInp("sales.saleMode", s.saleMode, [["sell", "Develop & Sell"], ["rent", "Buy & Hold / Rent"], ["hybrid", "Hybrid"]]));
      if (isSell) {
        html += '<div class="field col-12"><div class="section-label">' + icon("trending", 12) + ' Develop &amp; Sell — disposition assumptions</div></div>' +
          wfield(salesProfile.saleLabel, numInp("sales.sellPricePerSqm", s.sellPricePerSqm, "₱")) +
          (d.development.devType === "Subdivision + Shophouse" ? wfield("Lot Selling Price / Net Saleable sqm", numInp("sales.landSellPricePerSqm", s.landSellPricePerSqm, "₱")) : "") +
          wfield(salesProfile.unitLabel, numInp("sales.units", s.units)) +
          wfield("Saleable Area (%)", numInp("sales.saleablePct", s.saleablePct, "%")) +
          '<div class="field col-12"><div class="section-label">' + icon("doc", 12) + ' Transfer Costs — percentage or fixed ₱ amount</div></div>' +
          wfield("Capital Gains Tax (seller, %)", numInp("sales.cgtPct", s.cgtPct, "%")) +
          wfield("Documentary Stamp Tax (buyer, %)", numInp("sales.dstPct", s.dstPct, "%")) +
          wfield("LGU Transfer Tax (buyer, %)", numInp("sales.transferTaxPct", s.transferTaxPct == null ? lguTransferTax : s.transferTaxPct, "%")) +
          wfield("Registry of Deeds Fees (buyer, est. %)", numInp("sales.registrationFeePct", s.registrationFeePct, "%")) +
          wfield("Notarial Fees (negotiable, est. %)", numInp("sales.notarialFeePct", s.notarialFeePct, "%")) +
          wfield("Capital Gains Tax (fixed ₱)", numInp("sales.cgtAmount", s.cgtAmount, "₱")) +
          wfield("Documentary Stamp Tax (fixed ₱)", numInp("sales.dstAmount", s.dstAmount, "₱")) +
          wfield("LGU Transfer Tax (fixed ₱)", numInp("sales.transferTaxAmount", s.transferTaxAmount, "₱")) +
          wfield("Registry of Deeds Fees (fixed ₱)", numInp("sales.registrationFeeAmount", s.registrationFeeAmount, "₱")) +
          wfield("Notarial Fees (fixed ₱)", numInp("sales.notarialFeeAmount", s.notarialFeeAmount, "₱")) +
          '<div class="field col-12"><div class="section-label">' + icon("dollar", 12) + ' Other Selling Costs</div></div>' +
          wfield("Broker Commission (%)", numInp("sales.brokerPct", s.brokerPct, "%")) +
          wfield("VAT (%)", numInp("sales.vatPct", s.vatPct, "%")) +
          wfield("Other Selling Costs (%)", numInp("sales.sellingCostPct", s.sellingCostPct, "%")) +
          '<div class="field col-12"><p class="dim tiny">Philippine estimate: CGT is normally seller-paid; DST, LGU transfer tax, Registry of Deeds, and notarial fees are normally buyer-paid unless negotiated otherwise. Entering a fixed ₱ amount overrides that item’s percentage. The calculation uses the higher of gross selling price, estimated market value, or BIR zonal value. LGU transfer tax defaults to 0.75% in NCR and 0.5% elsewhere. Verify current BIR, LGU, Registry of Deeds, and notarial schedules before signing.</p></div>';
      }
      if (isRent) {
        html += '<div class="field col-12"><div class="section-label">' + icon("home", 12) + ' Buy &amp; Hold / Rent — rental assumptions</div></div>' +
          wfield(salesProfile.rentLabel, numInp("sales.rentalRatePerSqm", s.rentalRatePerSqm, "₱")) +
          wfield("Leasable Area (%)", numInp("sales.leasablePct", s.leasablePct, "%")) +
          wfield("Occupancy (%)", numInp("sales.occupancyPct", s.occupancyPct, "%")) +
          wfield("Operating Expenses (%)", numInp("sales.opCostPct", s.opCostPct, "%"));
      }
      html += '<div class="field col-12"><div class="section-label">' + icon("chart", 12) + ' Common — hold period &amp; discounting</div></div>' +
        wfield("Annual Appreciation (%)", numInp("sales.appreciationRate", s.appreciationRate, "%")) +
        wfield("Holding Period", numInp("sales.holdYears", s.holdYears, "yrs")) +
        wfield("Discount Rate (%)", numInp("sales.discountRate", s.discountRate, "%")) +
        '<div class="field col-12"><div class="fin-preview"><div class="dim tiny">Projected returns (auto)</div>' +
        '<div class="grid grid-4 mt-8">' +
        miniStat("Gross Revenue", 'id="wz-gross"') +
        miniStat("Profit", 'id="wz-profit"') +
        miniStat("ROI", 'id="wz-roi"') +
        miniStat("IRR", 'id="wz-irr"') +
        '</div></div></div>' +
        '<div class="field col-12"><div class="section-label">' + icon("trending", 12) + ' What-if sliders (live recompute)</div></div>' +
        '<div class="form-grid">' +
        (isSell ? wSlider("Selling Price / sqm", "sales.sellPricePerSqm", 10000, 300000, 1000) : "") +
        (isRent ? wSlider("Rental Rate / sqm/mo", "sales.rentalRatePerSqm", 0, 1500, 10) + wSlider("Occupancy (%)", "sales.occupancyPct", 0, 100, 5) : "") +
        wSlider("Annual Appreciation (%)", "sales.appreciationRate", 0, 15, 0.5) +
        wSlider("Discount Rate (%)", "sales.discountRate", 0, 20, 0.5) +
        wSlider("Holding Period (yrs)", "sales.holdYears", 1, 20, 1) +
        '</div>';
    }

    if (step === 7) {
      const comps = (d.comparables || []).length ? d.comparables : [blankComp(0)];
      const sug = buildComparableSuggestions();
      html += '<div class="field col-12"><label>Comparable Sales / Rentals</label>' +
        '<p class="dim tiny mb-8">Recent similar transactions used to sanity-check the pricing and rental assumptions on this investment.</p></div>';
      if (sug.length) {
        html += '<div class="field col-12"><label>Suggest from your saved data</label><div class="row" style="gap:8px;flex-wrap:wrap">' +
          '<select class="input grow" id="wz-comp-sug"><option value="">Choose a saved deal / appraisal comparable…</option>' +
          sug.map(s => '<option value="' + s.id + '">' + esc(s.label) + '</option>').join("") + '</select>' +
          '<button class="btn btn-ghost btn-sm" id="wz-add-sug">' + icon("plus", 13) + ' Add</button></div></div>';
      }
      comps.forEach((c, i) => { html += '<div class="field col-12">' + compRowHtml(c, i) + '</div>'; });
      html += '<div class="field col-12"><button class="btn btn-ghost btn-sm" id="wz-add-comp">' + icon("plus", 13) + ' Add Comparable</button></div>';
    }

    html += '</div></div>';
    const errs = wizardErrors(step, d);
    if (errs.length) {
      html += '<div class="wizard-err" id="wz-errs"><b>' + icon("zap", 13) + ' Fix before continuing:</b><ul>' + errs.map(e => "<li>" + e + "</li>").join("") + "</ul></div>";
    } else {
      html += '<div class="wizard-err" id="wz-errs" style="display:none"></div>';
    }
    html += '<div class="row mt-16" style="justify-content:space-between">' +
      (step > 1 ? '<button class="btn btn-ghost" id="wz-prev">← Back</button>' : '<span></span>') +
      (step < STEPS.length
        ? '<button class="btn btn-primary" id="wz-next" ' + (errs.length ? "disabled" : "") + '>Next →</button>'
        : '<button class="btn btn-primary" id="wz-analyze">' + icon("spark", 15) + ' Run AI Analysis</button>') +
      '</div>';
    return html;
  }

  function miniStat(label, idAttr) {
    return '<div class="kpi"><div class="k-label">' + label + '</div><div class="k-value" ' + idAttr + '>—</div></div>';
  }

  function blankComp(i) {
    return { id: "wc-" + Date.now() + "-" + i, type: "Sale", propertyType: "", improvement: "None", note: "", address: "", city: "", price: "", floorArea: "", lotArea: "", date: "", source: "" };
  }
  function compRowHtml(c, i) {
    const sel = v => '<select class="input" data-wc="type" data-wc-i="' + i + '"><option value="Sale"' + (c.type !== "Rental" ? " selected" : "") + '>Sale</option><option value="Rental"' + (c.type === "Rental" ? " selected" : "") + '>Rental</option></select>';
    const propSel = '<select class="input" data-wc="propertyType" data-wc-i="' + i + '"><option value="">— select —</option>' +
      D.PROPERTY_TYPES.map(t => '<option value="' + esc(t) + '"' + (t === c.propertyType ? " selected" : "") + '>' + esc(t) + '</option>').join("") + '</select>';
    const impSel = '<select class="input" data-wc="improvement" data-wc-i="' + i + '">' +
      ["None"].concat(STRUCTURE_TYPES).map(t => '<option value="' + esc(t) + '"' + (t === c.improvement ? " selected" : "") + '>' + esc(t) + '</option>').join("") + '</select>';
    return '<div class="comp-card">' +
      '<div class="row spread mb-8"><b>Comparable ' + (i + 1) + '</b><button class="btn btn-danger btn-sm" data-wc-rm="' + i + '" title="Remove">' + icon("trash", 12) + '</button></div>' +
      '<div class="form-grid">' +
      '<div class="field col-6"><label>Address / Description</label><input class="input" data-wc="address" data-wc-i="' + i + '" value="' + esc(c.address || "") + '" placeholder="e.g. Brgy. San Juan, near city hall"></div>' +
      '<div class="field col-6"><label>City / Municipality</label><input class="input" data-wc="city" data-wc-i="' + i + '" value="' + esc(c.city || "") + '"></div>' +
      '<div class="field col-3"><label>Type</label>' + sel(i) + '</div>' +
      '<div class="field col-3"><label>Type of Property</label>' + propSel + '</div>' +
      '<div class="field col-3"><label>Improvement on the Property</label>' + impSel + '</div>' +
      '<div class="field col-3"><label>Price / Monthly Rent (₱)</label><input class="input input-num" inputmode="decimal" autocomplete="off" data-wc="price" data-wc-i="' + i + '" value="' + C.fmtNum(c.price) + '"></div>' +
      '<div class="field col-3"><label>Floor Area (sqm)</label><input class="input input-num" inputmode="decimal" autocomplete="off" data-wc="floorArea" data-wc-i="' + i + '" value="' + C.fmtNum(c.floorArea) + '"></div>' +
      '<div class="field col-3"><label>Lot Area (sqm)</label><input class="input input-num" inputmode="decimal" autocomplete="off" data-wc="lotArea" data-wc-i="' + i + '" value="' + C.fmtNum(c.lotArea) + '"></div>' +
      '<div class="field col-3"><label>Date</label><input class="input" type="date" data-wc="date" data-wc-i="' + i + '" value="' + esc(c.date || "") + '"></div>' +
      '<div class="field col-6"><label>Source</label><input class="input" data-wc="source" data-wc-i="' + i + '" value="' + esc(c.source || "") + '" placeholder="Broker, Listings, Zonal, Tenant survey"></div>' +
      '<div class="field col-12"><label>Note</label><textarea class="input" data-wc="note" data-wc-i="' + i + '" rows="2" placeholder="Condition, transaction details, comparability notes…">' + esc(c.note || "") + '</textarea></div>' +
      '</div></div>';
  }
  function gatherComparables() {
    const d = state.current || freshDeal();
    if (!document.querySelector("#content [data-wc]")) return d;
    const rows = [];
    $$("#content [data-wc]").forEach(el => {
      const i = parseInt(el.getAttribute("data-wc-i"), 10);
      const k = el.getAttribute("data-wc");
      if (!rows[i]) rows[i] = {};
      rows[i][k] = el.tagName === "SELECT" ? el.value : (el.classList.contains("input-num") ? (el.value === "" ? "" : C.num(el.value)) : el.value);
    });
    d.comparables = rows.filter(r => r && Object.keys(r).length).map((r, i) => Object.assign({ id: "wc-" + Date.now() + "-" + i, type: "Sale" }, r));
    return d;
  }
  function gatherWizard() { gatherComparables(); return gatherDeal(); }

  function gatherDeal() {
    const d = state.current || freshDeal();
    $$("#content [data-g]").forEach(el => {
      const path = el.getAttribute("data-g").split(".");
      let o = d;
      for (let i = 0; i < path.length - 1; i++) { if (o[path[i]] == null) o[path[i]] = {}; o = o[path[i]]; }
      o[path[path.length - 1]] = el.classList.contains("input-num") ? (C.num(el.value) || 0) : el.value;
    });
    $$("#content [data-util]").forEach(b => {
      const key = b.getAttribute("data-util");
      d.property.utilities[key] = b.classList.contains("on");
    });
    $$("#content [data-near]").forEach(b => {
      const key = b.getAttribute("data-near");
      d.location.nearby[key] = b.classList.contains("on");
    });
    $$("#content [data-struct]").forEach(b => {
      const key = b.getAttribute("data-struct");
      const arr = (d.property.structures = d.property.structures || []);
      const i = arr.indexOf(key);
      if (b.classList.contains("on")) { if (i === -1) arr.push(key); } else if (i !== -1) arr.splice(i, 1);
    });
    return d;
  }

  function bindWizard() {
    $$("#content [data-util]").forEach(b => b.addEventListener("click", () => b.classList.toggle("on")));
    $$("#content [data-near]").forEach(b => b.addEventListener("click", () => b.classList.toggle("on")));
    $$("#content [data-struct]").forEach(b => b.addEventListener("click", () => b.classList.toggle("on")));

    // cascading region → province → city
    const region = $("#wz-region");
    const provinceWrap = () => { state.current = gatherDeal(); render(); };
    if (region) {
      region.addEventListener("change", () => {
        state.current = gatherDeal();
        state.current.property.province = "";
        state.current.property.city = "";
        save(); _forceMapSearch = true; render();
      });
    }
    const prov = $("#wz-province");
    if (prov) prov.addEventListener("change", () => { state.current = gatherDeal(); state.current.property.city = ""; save(); _forceMapSearch = true; render(); });
    const cityEl = $("#wz-city");
    if (cityEl) cityEl.addEventListener("change", () => {
      state.current = gatherDeal();
      save();
      searchMapOnPicker("wz-map", state.current.property.city);
    });

    // sale mode → show only the relevant Sales / Rental inputs
    const saleMode = $('#content [data-g="sales.saleMode"]');
    if (saleMode) saleMode.addEventListener("change", () => { state.current = gatherDeal(); save(); render(); });

    // Development type and goal reset the initial build plan from the recorded lot size.
    const devType = $('#content [data-g="development.devType"]');
    if (devType) devType.addEventListener("change", () => {
      state.current = gatherDeal();
      applyDevelopmentPreset(state.current, "custom", devType.value);
      save(); render();
    });
    const devGoal = $('#content [data-g="development.goal"]');
    if (devGoal) devGoal.addEventListener("change", () => {
      state.current = gatherDeal();
      applyDevelopmentPreset(state.current, devGoal.value, state.current.development.devType);
      save(); render();
    });
    const syncSales = $("#wz-sync-sales");
    if (syncSales) syncSales.addEventListener("click", () => {
      state.current = gatherDeal();
      syncSalesToDevelopment(state.current);
      save(); render();
    });

    // property type → show improvement / existing-structure inputs when the type carries a building
    const propType = $('#content [data-g="property.propertyType"]');
    if (propType) propType.addEventListener("change", () => { state.current = gatherDeal(); save(); render(); });

    // structure type → show mixed-use component picker when Mixed Use is chosen
    const structType = $('#content [data-g="property.structureType"]');
    if (structType) structType.addEventListener("change", () => { state.current = gatherDeal(); save(); render(); });

    // income-generating → reveal the monthly income input when Yes
    const incomeGen = $('#content [data-g="property.incomeGenerating"]');
    if (incomeGen) incomeGen.addEventListener("change", () => { state.current = gatherDeal(); save(); render(); });

    // live recompute on inputs
    const recalc = () => {
      const d = gatherDeal();
      const m = C.model(d);
      const bench = $("#wz-bench");
      if (bench) {
        bench.value = C.numFmt(m.marketValuePerSqm);
        $("#wz-bench-hint").textContent = "Benchmark for " + (d.property.city || "—") + " (demo data)";
      }
      const psm = $("#wz-pricepsm");
      if (psm) psm.value = d.property.lotArea > 0 ? C.numFmt(Math.round(d.purchase.price / d.property.lotArea)) : "0";
      const fees = $("#wz-fees");
      if (fees) fees.textContent = C.money(m.acquisition.totalFees) + " closing + ₱" + C.numFmt(d.purchase.negotiatedPrice) + " price → " + C.money(m.acquisition.acquisitionCost) + " total";
      const loan = $("#fin-loan"); if (loan) loan.textContent = C.money(m.acquisition.loanAmount);
      const monthly = $("#fin-monthly"); if (monthly) monthly.textContent = C.money(m.acquisition.monthly) + "/mo";
      const interest = $("#fin-interest"); if (interest) interest.textContent = C.money(m.acquisition.totalInterest);
      const equity = $("#fin-equity"); if (equity) equity.textContent = C.money(m.acquisition.equity);
      const dev = $("#wz-dev");
      if (dev) dev.textContent = (d.development.devType === "Subdivision" ? "Lot development " : "Construction ") + C.money(m.development.construction) + " · total " + C.money(m.development.total + m.financingCost);
      const costUnit = $("#wz-cost-unit");
      if (costUnit) {
        const units = Math.floor(C.num(d.development.units, 0));
        costUnit.textContent = units > 0 ? C.money(Math.round(m.development.construction / units)) : "Enter unit count";
      }
      const far = $("#wz-far");
      if (far) {
        const lotArea = C.num(d.property.lotArea, 0), floorArea = C.num(d.development.floorArea, 0);
        far.textContent = lotArea > 0 && floorArea > 0 ? (floorArea / lotArea).toFixed(2) + "x" : "Enter total floor area";
      }
      const estBudget = m.acquisition.acquisitionCost + m.development.total + m.financingCost;
      const budgetEl = $("#wz-budget");
      if (budgetEl) budgetEl.textContent = C.money(estBudget);
      const diffEl = $("#wz-budget-diff");
      if (diffEl) {
        const planned = C.num(d.development.projectBudget) || 0;
        if (planned > 0) {
          const v = planned - estBudget;
          diffEl.textContent = (v >= 0 ? "+" : "−") + C.money(Math.abs(v)) + (v >= 0 ? " surplus" : " shortfall");
        } else {
          diffEl.textContent = "Enter a planned budget";
        }
      }
      const gross = $("#wz-gross"); if (gross) gross.textContent = C.money(m.returns.grossRevenue);
      const profit = $("#wz-profit"); if (profit) profit.textContent = C.money(m.returns.profit);
      const roi = $("#wz-roi"); if (roi) roi.textContent = C.pct(m.returns.roi);
      const irrEl = $("#wz-irr"); if (irrEl) irrEl.textContent = C.pct(m.returns.irr);
      const elig = $("#wz-loan-elig");
      if (elig) {
        const a = m.acquisition;
        if (a.isLoan) {
          const capPct = Math.round(a.ltvCap * 100);
          const pagIbig = a.finType === "Pag-IBIG" ? " · Pag-IBIG ₱6.0M ceiling" : "";
          elig.textContent = a.loanAmount > a.loanEligible
            ? "⚠ " + a.finType + " LTV cap " + capPct + "% → loanable max " + C.money(a.loanEligible) + pagIbig + " · requested " + C.money(a.loanAmount) + " (" + C.money(a.loanShortfall) + " shortfall — raise equity or lower the loan)"
            : "✓ " + a.finType + " LTV cap " + capPct + "% → loanable up to " + C.money(a.loanEligible) + pagIbig + " · requested " + C.money(a.loanAmount) + " within cap";
        } else {
          elig.textContent = "Cash purchase — no loan required.";
        }
      }
      $$("#content [data-sl]").forEach(sl => {
        const g = sl.getAttribute("data-sl");
        const inp = $('#content [data-g="' + g + '"]');
        if (!inp) return;
        const v = C.num(inp.value, 0);
        sl.value = Math.min(Math.max(v, parseFloat(sl.min) || 0), parseFloat(sl.max) || 100);
        const lb = $("#wz-sl-" + g.replace(/\./g, "-") + "-val");
        if (lb) lb.textContent = g === "sales.sellPricePerSqm" || g === "sales.rentalRatePerSqm" ? C.money(Math.round(v)) : (g === "sales.holdYears" ? v + " yrs" : v + "%");
      });
      const saveSt = $("#wz-save-status");
      if (saveSt) saveSt.innerHTML = icon("check", 11) + " Draft autosaved · " + new Date().toLocaleTimeString();
      save();
      syncWizardValidation(d);
    };
    $$("#content [data-g]").forEach(el => el.addEventListener("input", recalc));
    recalc();

    // map pinpoint → auto-fill Latitude / Longitude; dropdowns search the map
    const d0 = state.current;
    const wantSearch = _forceMapSearch || !(d0 && d0.property.lat && d0.property.lng);
    const searchText = wantSearch ? ((d0 && d0.property.city) || (d0 && d0.property.province) || "") : "";
    initMapPicker("wz-map", d0 && d0.property.lat, d0 && d0.property.lng, (lat, lng) => {
      const d = gatherDeal();
      d.property.lat = lat;
      d.property.lng = lng;
      save();
    }, searchText);
    _forceMapSearch = false;

    const aiLoc = $("#wz-ai-loc");
    if (aiLoc) aiLoc.addEventListener("click", runWizardLocationAnalysis);

    // comparable sales/rental rows (step 7)
    $$("#content [data-wc]").forEach(el => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => { gatherComparables(); save(); }));
    const addComp = $("#wz-add-comp");
    if (addComp) addComp.addEventListener("click", () => {
      const d = gatherComparables();
      (d.comparables = d.comparables || []).push(blankComp(d.comparables.length));
      save(); render();
    });
    $$("#content [data-wc-rm]").forEach(btn => btn.addEventListener("click", () => {
      const d = gatherComparables();
      const i = parseInt(btn.getAttribute("data-wc-rm"), 10);
      d.comparables.splice(i, 1);
      if (!d.comparables.length) d.comparables.push(blankComp(0));
      save(); render();
    }));

    // what-if sliders drive the underlying numeric inputs
    $$("#content [data-sl]").forEach(sl => sl.addEventListener("input", () => {
      const inp = $('#content [data-g="' + sl.getAttribute("data-sl") + '"]');
      if (inp) { inp.value = sl.value; inp.dispatchEvent(new Event("input", { bubbles: true })); }
    }));

    // import a comparable from saved deals / appraisals
    const addSug = $("#wz-add-sug");
    if (addSug) addSug.addEventListener("click", () => {
      const sel = $("#wz-comp-sug");
      if (!sel || !sel.value) { toast("Pick a comparable first", "err"); return; }
      const sug = buildComparableSuggestions().find(s => s.id === sel.value);
      if (!sug) return;
      const d = gatherComparables();
      (d.comparables = d.comparables || []).push(Object.assign(blankComp(d.comparables.length), sug.comp));
      save(); render();
      toast("Comparable added from saved data");
    });

    const cancel = $("#wz-cancel");
    if (cancel) cancel.addEventListener("click", () => {
      if (!confirm("Discard this draft investment?")) return;
      state.current = null;
      state.wizardStep = 1;
      save();
      navigate("dashboard");
    });

    const prev = $("#wz-prev"), next = $("#wz-next"), an = $("#wz-analyze");
    if (prev) prev.addEventListener("click", () => { state.current = gatherWizard(); state.wizardStep--; save(); render(); });
    if (next) next.addEventListener("click", () => {
      const d = gatherWizard();
      const errs = wizardErrors(state.wizardStep, d);
      if (errs.length) { toast("Complete the highlighted fields first", "err"); return; }
      state.current = d;
      state.wizardStep++;
      save(); render();
    });
    if (an) an.addEventListener("click", () => {
      state.current = gatherWizard();
      if (!state.current.property.name) state.current.property.name = "Untitled Property (" + (state.current.property.city || "PH") + ")";
      if (!state.current.property.marketValuePerSqm) state.current.property.marketValuePerSqm = D.benchmarkFor(state.current.property.city);
      state.current.building.constructionType = state.current.development.devType === "Vacant Lot" ? "—" : "CHB / Masonry";
      save();
      navigate("deal");
      toast("AI analysis complete — open the Deal Analysis tabs");
    });
  }

  /* ================= DEAL ANALYSIS ================= */
  const TABS = [
    ["overview", "Overview"], ["details", "Investment Details"], ["ai", "AI Analysis"], ["returns", "Returns"], ["development", "Development"],
    ["financing", "Financing"], ["scenarios", "Scenarios"], ["location", "Location"], ["risk", "Risk"]
  ];

  function renderDeal() {
    if (!state.current) {
      return '<div class="card card-pad empty">' + icon("search", 50) + "<h3>No deal loaded</h3><p>Create a new investment or open one from your portfolio.</p><div class='row' style='justify-content:center'><button class='btn btn-primary' data-view='wizard'>" + icon("plus", 15) + " New Investment</button></div></div>";
    }
    const raw = state.current;
    const m = C.model(raw);
    const rec = C.recommend(raw);

    let html = '<div class="tabs">';
    TABS.forEach(t => html += '<button class="tab' + (state.dealTab === t[0] ? " active" : "") + '" data-dtab="' + t[0] + '">' + t[1] + '</button>');
    html += '</div>';
    html += '<div class="row spread mb-16" style="flex-wrap:wrap;gap:12px"><div><b style="font-size:18px">' + esc(raw.property.name || "Untitled") + '</b><div class="dim tiny mt-8">' + esc([raw.property.barangay, raw.property.city, raw.property.province].filter(Boolean).join(", ") || "No location") + '</div></div>' +
      '<div class="row" style="gap:10px"><span class="badge ' + (rec.pass ? "green" : "red") + '" style="font-size:13px;padding:7px 14px">Grade ' + rec.grade + ' · ' + rec.verdict + '</span>' +
      '<button class="btn btn-ghost btn-sm" id="make-appraisal">' + icon("scale", 14) + ' Create Appraisal</button>' +
      '<button class="btn btn-ghost btn-sm" id="edit-deal">' + icon("edit", 14) + ' Edit in Wizard</button>' +
      '<button class="btn btn-ghost btn-sm" id="ds-preview">' + icon("print", 14) + ' Deal Summary PDF</button>' +
      '<button class="btn btn-ghost btn-sm" id="save-deal">' + icon("check", 14) + ' Save to Portfolio</button></div></div>';

    const tab = state.dealTab || "overview";
    if (tab === "overview") html += dealOverview(m, rec, raw);
    if (tab === "details") html += dealDetails(raw);
    if (tab === "ai") html += dealAI(m, rec, raw);
    if (tab === "returns") html += dealReturns(m, raw);
    if (tab === "development") html += dealDevelopment(m, raw);
    if (tab === "financing") html += dealFinancing(m, raw);
    if (tab === "scenarios") html += dealScenarios(m, raw);
    if (tab === "location") html += dealLocation(m, raw);
    if (tab === "risk") html += dealRisk(m, rec, raw);
    return html;
  }

  function dealDetails(raw) {
    const p = raw.property || {}, b = raw.purchase || {}, f = raw.financing || {};
    const d = raw.development || {}, s = raw.sales || {}, loc = raw.location || {};
    const escValue = v => v === null || v === undefined || v === "" ? "—" : esc(String(v));
    const row = (label, value) => "<tr><td>" + esc(label) + "</td><td>" + escValue(value) + "</td></tr>";
    const moneyRow = (label, value) => row(label, C.money(value));
    const table = (title, rows) => '<div class="card card-pad"><h3 class="mb-16">' + esc(title) + '</h3><div class="table-wrap"><table class="data"><tbody>' + rows.join("") + "</tbody></table></div></div>";
    const utilities = Object.keys(p.utilities || {}).filter(k => p.utilities[k]).join(", ");
    const nearby = Object.keys(loc.nearby || {}).filter(k => loc.nearby[k]).join(", ");
    const comps = (raw.comparables || []).filter(c => c && (c.address || c.city || C.num(c.price, 0) > 0));
    let html = '<div class="ai-banner mb-24">' + icon("doc", 14) + '<span>These are the inputs captured in <b>New Investment</b>. Calculated returns and recommendations are shown in the other Deal Analysis tabs.</span></div>';
    html += '<div class="grid grid-2 mb-24">';
    html += table("Property & Existing Structure", [
      row("Property Name", p.name), row("Property Type", p.propertyType), row("Current Land Use", p.landUse), row("Zoning", p.zoning),
      row("Lot Area", p.lotArea ? C.numFmt(p.lotArea) + " sqm" : ""), row("Frontage", p.frontage ? C.numFmt(p.frontage) + " m" : ""), row("Depth", p.depth ? C.numFmt(p.depth) + " m" : ""),
      row("Road Width / Type", (p.roadWidth ? C.numFmt(p.roadWidth) + " m · " : "") + (p.roadType || "")), row("Flood Risk", p.floodRisk), row("Utilities", utilities),
      row("Structure", p.structureType), row("Year Built", p.yearBuilt || ""), row("Existing Floors", p.floors || ""), row("Existing Floor Area", p.existingFloorArea ? C.numFmt(p.existingFloorArea) + " sqm" : ""),
      row("Condition", p.condition), moneyRow("Improvement Value", p.improvementValue), row("Income Generating", p.incomeGenerating), moneyRow("Monthly Income", p.monthlyIncome)
    ]);
    html += table("Location & Site", [
      row("Region", p.region), row("Province", p.province), row("City / Municipality", p.city), row("Barangay", p.barangay), row("Complete Address", p.address),
      row("Coordinates", p.lat && p.lng ? p.lat + ", " + p.lng : ""), row("Nearby Establishments", nearby), row("Accessibility Score", loc.accessibilityScore), row("Traffic Load", loc.trafficScore),
      row("Population Score", loc.populationScore), row("Future Development", loc.futureDevScore), row("Competition", loc.competitionScore), row("Commercial Growth", loc.commercialGrowthScore)
    ]);
    html += '</div><div class="grid grid-2 mb-24">';
    html += table("Acquisition", [
      moneyRow("Purchase Price", b.price), moneyRow("Negotiated Price", b.negotiatedPrice), row("Seller Type", b.sellerType), moneyRow("Taxes", b.taxes),
      moneyRow("Transfer Fees", b.transferFees), moneyRow("Legal Fees", b.legalFees), moneyRow("Survey Cost", b.surveyCost), moneyRow("Miscellaneous Costs", b.miscCost)
    ]);
    html += table("Financing", [
      row("Financing Type", f.type), row("Loan % of Purchase Price", f.loanPct ? f.loanPct + "%" : ""), row("Interest Rate", f.interestRate ? f.interestRate + "% / year" : ""), row("Term", f.years ? f.years + " years" : "")
    ]);
    html += '</div><div class="grid grid-2 mb-24">';
    html += table("Development Plan", [
      row("Development Goal", d.goal), row("Development Type", d.devType), row("Units / Lots", d.units || d.lots || ""), row("Floors", d.floors || ""),
      row("Total Floor Area", d.floorArea ? C.numFmt(d.floorArea) + " sqm" : ""), row("Typical Lot Size", d.lotSqm ? C.numFmt(d.lotSqm) + " sqm" : ""), row("Shophouse Lots", d.shophouseLots || ""),
      row("Construction Months", d.buildMonths || ""), moneyRow("Construction Cost / sqm", d.constCostPerSqm), row("Site Development", d.siteDevPct ? d.siteDevPct + "%" : ""), row("Professional Fees", d.profFeesPct ? d.profFeesPct + "%" : ""),
      moneyRow("Permit Fees", d.permits), row("Contingency", d.contingencyPct ? d.contingencyPct + "%" : ""), moneyRow("Amenities Budget", d.amenities), moneyRow("Marketing Budget", d.marketing), moneyRow("Carrying Cost / month", d.carryingMonthly), moneyRow("Planned Project Budget", d.projectBudget)
    ]);
    html += table("Sales & Holding", [
      row("Sale Mode", s.saleMode === "sell" ? "Develop & Sell" : s.saleMode === "rent" ? "Buy & Hold / Rent" : s.saleMode === "hybrid" ? "Hybrid" : s.saleMode), moneyRow("Selling Price / sqm", s.sellPricePerSqm), moneyRow("Land Selling Price / sqm", s.landSellPricePerSqm), moneyRow("Rental Rate / sqm / month", s.rentalRatePerSqm),
      row("Units / Lots for Sale", s.units || ""), row("Saleable Area", s.saleablePct ? s.saleablePct + "%" : ""), row("Leasable Area", s.leasablePct ? s.leasablePct + "%" : ""), row("Occupancy", s.occupancyPct ? s.occupancyPct + "%" : ""), row("Operating Expenses", s.opCostPct ? s.opCostPct + "%" : ""),
      row("Annual Appreciation", s.appreciationRate ? s.appreciationRate + "%" : ""), row("Holding Period", s.holdYears ? s.holdYears + " years" : ""), row("Discount Rate", s.discountRate ? s.discountRate + "%" : ""), row("Broker Commission", s.brokerPct ? s.brokerPct + "%" : ""), row("VAT", s.vatPct ? s.vatPct + "%" : "")
    ]);
    html += '</div>';
    html += '<div class="card card-pad"><h3 class="mb-16">Comparable Sales / Rentals</h3>' + (comps.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Address</th><th>City</th><th>Type</th><th class="num">Price</th><th class="num">Lot Area</th><th>Source</th></tr></thead><tbody>' + comps.map((c, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(c.address || "—") + '</td><td>' + esc(c.city || "—") + '</td><td>' + esc(c.type || "—") + '</td><td class="num">' + C.money(c.price) + '</td><td class="num">' + (c.lotArea ? C.numFmt(c.lotArea) + " sqm" : "—") + '</td><td>' + esc(c.source || "—") + '</td></tr>').join("") + '</tbody></table></div>' : '<p class="dim">No comparable sales or rentals recorded in New Investment.</p>') + '</div>';
    return html;
  }

  function kpi(label, value, sub, cls, icn) {
    return '<div class="card kpi ' + (cls || "") + '"><div class="k-label">' + (icn ? icon(icn, 12) + " " : "") + label + '</div><div class="k-value">' + value + '</div>' + (sub ? '<div class="k-sub">' + sub + '</div>' : "") + '</div>';
  }

  function dealOverview(m, rec, raw) {
    const r = m.returns, a = m.acquisition;
    const dev = raw.development, sales = raw.sales;
    const goalLabel = (DEVELOPMENT_GOALS.find(x => x[0] === (dev.goal || "custom")) || DEVELOPMENT_GOALS[0])[1];
    const recommended = rec.hbu.recommendation;
    const aligned = dev.devType === recommended.devType;
    const saleModeLabel = sales.saleMode === "rent" ? "Buy & Hold / Rent" : sales.saleMode === "hybrid" ? "Hybrid" : "Develop & Sell";
    const priceGap = m.marketValuePerSqm > 0 ? (C.num(sales.sellPricePerSqm, 0) / m.marketValuePerSqm) - 1 : 0;
    const landPriceGap = m.marketValuePerSqm > 0 ? (C.num(sales.landSellPricePerSqm, 0) / m.marketValuePerSqm) - 1 : 0;
    const purchaseGap = m.estMarketValue > 0 ? (a.negotiated / m.estMarketValue) - 1 : 0;
    const saleBasis = dev.devType === "Subdivision + Shophouse"
      ? C.money(sales.landSellPricePerSqm) + "/sqm lot target · " + C.money(sales.sellPricePerSqm) + "/sqm shophouse target"
      : sales.saleMode === "rent"
      ? C.money(sales.rentalRatePerSqm) + "/sqm/mo rental target"
      : C.money(sales.sellPricePerSqm) + "/sqm exit target";
    const marketComparison = dev.devType === "Subdivision + Shophouse"
      ? "Projected lot sales " + C.money(r.lotRevenue) + " · shophouse sales " + C.money(r.shophouseRevenue) + " · lot target " + (landPriceGap >= 0 ? "+" : "") + C.pct(landPriceGap) + " vs land benchmark"
      : sales.saleMode === "rent"
      ? "Rental demand score " + rec.loc.demandScore + "/100 · commercial score " + rec.loc.commercialScore + "/100"
      : "Exit target " + (priceGap >= 0 ? "+" : "") + C.pct(priceGap) + " vs land benchmark";
    const assessment = aligned
      ? "The selected development plan matches the market's recommended highest and best use."
      : "The market recommends " + recommended.label + ", while the current plan is " + dev.devType + ". Review absorption, pricing, and build cost before committing.";
    let html = '<div class="value-hero"><div><div class="v-k">Estimated Project Profit</div><div class="v-big">' + C.money(r.profit) + '</div><div class="mt-8" style="opacity:.9;font-size:12px">ROI ' + C.pct(r.roi) + ' · IRR ' + C.pct(r.irr) + ' · Grade ' + rec.grade + '</div></div><div><div class="row" style="gap:8px"><span class="badge" style="background:rgba(255,255,255,.2)">' + m.property.city + '</span><span class="badge" style="background:rgba(255,255,255,.2)">' + m.property.propertyType + '</span></div></div></div>';
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Total Investment", C.money(r.investment), "acquisition + development", "green", "dollar") +
      kpi("Gross Revenue", C.money(r.grossRevenue), C.numFmt(r.saleableArea) + " sqm saleable", "blue", "trending") +
      kpi("Net Profit", C.money(r.profit), "after selling costs", "green", "check") +
      kpi("Cash Required", C.money(a.equity), "equity + closing + financing", "gold", "briefcase") + '</div>';
    html += '<div class="card card-pad mb-24" id="deal-plan-market"><div class="row spread mb-16" style="flex-wrap:wrap;gap:10px"><h3 style="margin:0">Development Plan vs Market</h3><span class="badge ' + (aligned ? "green" : "gold") + '" id="deal-plan-alignment">' + (aligned ? "Plan aligns with market" : "Market-plan review needed") + '</span></div>' +
      '<div class="grid grid-3">' +
      '<div><div class="dim tiny">Selected Development Goal</div><b id="deal-plan-goal">' + esc(goalLabel) + '</b><div class="dim tiny mt-8">' + esc(dev.devType) + ' · ' + esc(developmentSalesSummary(raw)) + '</div></div>' +
      '<div><div class="dim tiny">Sales Strategy</div><b>' + esc(saleModeLabel) + '</b><div class="dim tiny mt-8">' + saleBasis + ' · ' + marketComparison + '</div></div>' +
      '<div><div class="dim tiny">Market Recommended Goal</div><b>' + esc(recommended.label) + '</b><div class="dim tiny mt-8">' + esc(recommended.reasons.join(" · ")) + '</div></div>' +
      '</div><div class="ai-banner mt-16">' + icon("target", 14) + '<span>' + esc(assessment) + ' Acquisition is ' + (purchaseGap >= 0 ? "at a " + C.pct(purchaseGap) + " premium" : "at a " + C.pct(Math.abs(purchaseGap)) + " discount") + ' to the estimated land market value. Finished-product sale targets and land benchmarks are not directly comparable; validate against product-specific comparables.</span></div></div>';
    html += '<div class="grid grid-2 mb-24">' +
      '<div class="card card-pad"><h3 class="mb-16">Key Returns</h3><div class="table-wrap"><table class="data"><tr><th>Metric</th><th class="num">Value</th></tr>' +
      "<tr><td>ROI</td><td class='num'>" + C.pct(r.roi) + "</td></tr>" +
      "<tr><td>IRR</td><td class='num'>" + C.pct(r.irr) + "</td></tr>" +
      "<tr><td>NPV @ " + C.pct(m.property.growthRate) + " growth</td><td class='num'>" + C.money(r.npv) + "</td></tr>" +
      "<tr><td>Payback Period</td><td class='num'>" + r.paybackYears + " yrs</td></tr>" +
      "<tr><td>Profit Margin</td><td class='num'>" + C.pct(r.profitMargin) + "</td></tr>" +
      "<tr><td>Cash-on-Cash</td><td class='num'>" + C.pct(r.cashOnCash) + "</td></tr>" +
      "<tr><td>Cap Rate</td><td class='num'>" + C.pct(r.capRate) + "</td></tr>" +
      "</table></div></div>" +
      '<div class="card card-pad"><h3 class="mb-16">Market Snapshot</h3><div class="table-wrap"><table class="data"><tr><th>Metric</th><th class="num">Value</th></tr>' +
      "<tr><td>Est. Market Value</td><td class='num'>" + C.money(m.estMarketValue) + "</td></tr>" +
      "<tr><td>Market / sqm</td><td class='num'>" + C.money(m.marketValuePerSqm) + "</td></tr>" +
      "<tr><td>Purchase Price / sqm</td><td class='num'>" + C.money(m.property.lotArea > 0 ? Math.round(a.negotiated / m.property.lotArea) : 0) + "</td></tr>" +
      "<tr><td>Appreciation / yr</td><td class='num'>" + C.pct(m.property.growthRate) + "</td></tr>" +
      "<tr><td>Recommended Offer</td><td class='num'>" + C.money(rec.suggestedOffer) + "</td></tr>" +
      "<tr><td>Maximum Price</td><td class='num'>" + C.money(rec.maxPrice) + "</td></tr>" +
      "</table></div></div></div>";
    html += '<div class="card card-pad"><h3 class="mb-16">AI Recommendation</h3><div class="ai-banner">' + icon("spark", 14) + '<span>' + esc(rec.verdict) + " Best use: <b>" + esc(rec.hbu.recommendation.label) + "</b> (" + rec.total + "/100).</span></div></div>";
    return html;
  }

  function dealAI(m, rec, raw) {
    const loc = rec.loc;
    let html = '<div class="ai-banner mb-24">' + icon("spark", 14) + ' <span><b>AI badge:</b> These scores are model estimates computed from your inputs with documented heuristics. In production they come from OpenAI function-calling over live Google Places data. Not financial advice.</span></div>';
    html += '<div class="card card-pad mb-24"><h3 class="mb-16">' + icon("target", 15) + ' Location &amp; Demand Scores <span class="badge ai">AI</span></h3><div class="ai-score-grid">' +
      scoreRing("Location", loc.locationScore) + scoreRing("Demand", loc.demandScore) + scoreRing("Commercial", loc.commercialScore) + scoreRing("Investment", loc.investmentScore) +
      '</div><div class="mt-16" style="display:flex;flex-direction:column;gap:10px">' +
      Object.keys(loc.rationales).map(k => '<div style="font-size:12.5px;color:var(--text-dim)"><b>' + k.charAt(0).toUpperCase() + k.slice(1) + ':</b> ' + esc(loc.rationales[k]) + '</div>').join("") +
      '</div></div>';
    html += '<div class="card card-pad"><h3 class="mb-16">' + icon("spark", 15) + ' Highest &amp; Best Use <span class="badge ai">AI</span></h3><p style="font-size:14px"><b>' + esc(rec.hbu.recommendation.label) + '</b></p><ul class="deal-list">' +
      rec.hbu.recommendation.reasons.map(x => "<li>" + x + "</li>").join("") + '</ul></div>';
    return html;
  }

  function scoreRing(label, val) {
    const color = val >= 65 ? "#F97316" : val >= 45 ? "#F5B940" : "#EF4444";
    return '<div class="card" style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center"><div class="score-ring" style="--p:' + val + ';--c:' + color + '"><div class="inner" style="color:' + color + '">' + val + '</div></div><b style="font-size:12.5px">' + label + '</b></div>';
  }

  function dealReturns(m, raw) {
    const r = m.returns;
    let html = '<div class="grid grid-4 mb-24">' +
      kpi("Gross Revenue", C.money(r.grossRevenue), C.numFmt(r.saleableArea) + " sqm", "blue") +
      kpi("Net Revenue", C.money(r.netRevenue), C.pct(r.sellPct) + " selling cost (CGT + broker + VAT)", "green") +
      kpi("Profit", C.money(r.profit), "after all costs", "green") +
      kpi("Profit Margin", C.pct(r.profitMargin), "on gross revenue", "gold") + '</div>';
    html += '<div class="grid grid-4 mb-24">' +
      kpi("ROI", C.pct(r.roi), "on total invested", "green") +
      kpi("IRR", C.pct(r.irr), "on " + r.holdYears + "yr cash flow", "green") +
      kpi("NPV", C.money(r.npv), "@ " + C.pct(m.sales.discountRate) + " discount", "blue") +
      kpi("Payback", r.paybackYears + " yrs", "cumulative CF ≥ 0", "gold") + '</div>';
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Cap Rate", C.pct(r.capRate), "NOI / total dev cost", "cyan") +
      kpi("Cash-on-Cash", C.pct(r.cashOnCash), "annual CF / equity", "purple") +
      kpi("Gross Rent Multiplier", r.grossRentMultiplier.toFixed(1) + "×", "cost / NOI", "gold") +
      kpi("Break-Even Units", r.breakEvenUnits, "units to cover cost", "blue") + '</div>';
    html += '<div class="card card-pad"><h3 class="mb-16">Cash Flow Series (annual)</h3><div class="table-wrap"><table class="data"><tr><th>Year</th><th class="num">Cash Flow</th><th class="num">Cumulative</th></tr>';
    let cum = 0;
    r.cashflows.forEach((cf, t) => {
      cum += cf;
      html += "<tr><td>" + (t === 0 ? "Now" : "Y" + t) + "</td><td class='num'>" + C.money(cf) + "</td><td class='num'>" + C.money(cum) + "</td></tr>";
    });
    html += '</table></div></div>';
    return html;
  }

  function dealDevelopment(m, raw) {
    const dd = m.development;
    const rows = [
      ["Construction", dd.construction], ["Site Development (" + C.pct(dd.siteDevPct) + ")", dd.siteDev],
      ["Professional Fees (" + C.pct(dd.profPct) + ")", dd.profFees], ["Permits", dd.permits],
      ["Amenities", dd.amenities], ["Contingency (" + C.pct(dd.contingencyPct) + ")", dd.contingency],
      ["Marketing", dd.marketing], ["Carrying during build", dd.carrying], ["Financing During Construction", m.financingCost],
      ["TOTAL DEVELOPMENT COST", dd.total + m.financingCost]
    ];
    let html = '<div class="grid grid-4 mb-24">' +
      kpi("Construction Cost", C.money(dd.construction), C.numFmt(dd.floorArea) + " sqm", "blue") +
      kpi("Total Dev Cost", C.money(dd.total + m.financingCost), "incl. construction financing", "green") +
      kpi("Cost / sqm", C.money(dd.constCostPerSqm), "construction", "gold") +
      kpi("Build Size / Lot", dd.floorArea > 0 && m.property.lotArea > 0 ? (dd.floorArea / m.property.lotArea).toFixed(2) + "x" : "—", "auto: floor area ÷ lot", "purple") + '</div>';
    html += '<div class="card card-pad"><h3 class="mb-16">Cost Breakdown</h3><div class="table-wrap"><table class="data"><tr><th>Line Item</th><th class="num">Amount</th><th class="num">% of Total</th></tr>';
    rows.forEach((r, i) => {
      const pctOf = r[1] > 0 ? (r[1] / (dd.total + m.financingCost)) : 0;
      html += "<tr" + (i === rows.length - 1 ? ' style="font-weight:700"' : "") + "><td>" + r[0] + "</td><td class='num'>" + C.money(r[1]) + "</td><td class='num'>" + C.pct(pctOf) + "</td></tr>";
    });
    html += '</table></div></div>';
    return html;
  }

  function dealFinancing(m, raw) {
    const a = m.acquisition;
    let html = '<div class="grid grid-4 mb-24">' +
      kpi("Loan Amount", C.money(a.loanAmount), C.pct(a.loanPct) + " of negotiated", "blue") +
      kpi("Monthly Amortization", C.money(a.monthly) + "/mo", a.finType, "green") +
      kpi("Total Interest", C.money(a.totalInterest), "over term", "gold") +
      kpi("Equity Required", C.money(a.equity), "down + closing + financing", "purple") + '</div>';
    html += '<div class="card card-pad"><h3 class="mb-16">Acquisition Breakdown</h3><div class="table-wrap"><table class="data"><tr><th>Item</th><th class="num">Amount</th></tr>' +
      "<tr><td>Purchase Price</td><td class='num'>" + C.money(a.price) + "</td></tr>" +
      "<tr><td>Negotiated Price</td><td class='num'>" + C.money(a.negotiated) + "</td></tr>" +
      "<tr><td>Taxes</td><td class='num'>" + C.money(a.taxes) + "</td></tr>" +
      "<tr><td>Transfer Fees</td><td class='num'>" + C.money(a.transferFees) + "</td></tr>" +
      "<tr><td>Legal Fees</td><td class='num'>" + C.money(a.legalFees) + "</td></tr>" +
      "<tr><td>Survey Cost</td><td class='num'>" + C.money(a.surveyCost) + "</td></tr>" +
      "<tr><td>Misc Costs</td><td class='num'>" + C.money(a.miscCost) + "</td></tr>" +
      "<tr style='font-weight:700'><td>Total Acquisition</td><td class='num'>" + C.money(a.acquisitionCost) + "</td></tr>" +
      '</table></div></div>';
    return html;
  }

  function dealScenarios(m, raw) {
    const scs = C.buildAllScenarios(raw).sort((x, y) => (y.m.returns.roi * 100 + y.m.returns.irr * 60) - (x.m.returns.roi * 100 + x.m.returns.irr * 60));
    let html = '<div class="grid grid-3 mb-24">';
    scs.forEach((s, i) => {
      html += '<div class="card scenario" data-scenario="' + s.key + '"><div class="sc-name">' + icon("layers", 15) + ' ' + s.label + '</div><div class="sc-sub">' + s.desc + '</div>' +
        '<div class="sc-rank">' + (i === 0 ? "★ Top pick — " : "Rank " + (i + 1) + " — ") + C.pct(s.m.returns.roi) + " ROI · " + C.pct(s.m.returns.irr) + " IRR</div>" +
        '<div class="dim tiny mt-8">Profit ' + C.money(s.m.returns.profit) + ' · ' + C.money(s.m.returns.investment) + ' invested</div></div>';
    });
    html += '</div><div class="card card-pad"><h3 class="mb-16">Scenario Comparison</h3><div class="table-wrap"><table class="data"><tr><th>Scenario</th><th class="num">Investment</th><th class="num">Loan</th><th class="num">ROI</th><th class="num">IRR</th><th class="num">Cash Flow</th><th class="num">Profit</th><th class="num">Timeline</th></tr>';
    scs.forEach(s => {
      html += "<tr><td>" + s.label + (s.key === scs[0].key ? ' <span class="badge green">Best</span>' : "") + "</td><td class='num'>" + C.money(s.m.returns.investment) + "</td><td class='num'>" + C.money(s.m.acquisition.loanAmount) + "</td><td class='num'>" + C.pct(s.m.returns.roi) + "</td><td class='num'>" + C.pct(s.m.returns.irr) + "</td><td class='num'>" + C.money(s.m.returns.noi) + "</td><td class='num'>" + C.money(s.m.returns.profit) + "</td><td class='num'>" + s.m.returns.holdYears + " yrs</td></tr>";
    });
    html += '</table></div><p class="dim tiny mt-8">AI recommendation: <b>' + scs[0].label + '</b> offers the best return profile for this property.</p></div>';
    return html;
  }

  function dealLocation(m, raw) {
    const loc = C.locationAnalysis(raw);
    const p = raw.property;
    const coords = D.coordsFor(p.city);
    let html = '<div class="grid grid-4 mb-24">' +
      kpi("Location Score", loc.locationScore + "/100", loc.rationales.location, "green") +
      kpi("Demand Score", loc.demandScore + "/100", loc.rationales.demand, "blue") +
      kpi("Commercial Score", loc.commercialScore + "/100", loc.rationales.commercial, "purple") +
      kpi("Investment Score", loc.investmentScore + "/100", "blend of all three", "cyan") + '</div>';
    html += '<div class="grid grid-2 mb-24"><div class="card card-pad"><h3 class="mb-16">Nearby Establishments</h3><div class="table-wrap"><table class="data"><tr><th>Type</th><th>Status</th></tr>' +
      D.NEARBY_TYPES.map(n => "<tr><td>" + n + "</td><td>" + (raw.location.nearby[n] ? '<span class="badge green">Nearby</span>' : '<span class="badge" style="background:var(--surface-2);color:var(--text-faint)">Not flagged</span>') + "</td></tr>").join("") +
      '</table></div></div>' +
      '<div class="card card-pad"><h3 class="mb-16">Map Preview</h3><div style="height:240px;border-radius:12px;overflow:hidden;border:1px solid var(--stroke)">' +
      '<iframe class="map-frame" style="width:100%;height:100%;border:0;filter:grayscale(.2)" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=' + (coords[1] - 0.02) + '%2C' + (coords[0] - 0.02) + '%2C' + (coords[1] + 0.02) + '%2C' + (coords[0] + 0.02) + '&layer=mapnik&marker=' + coords[0] + '%2C' + coords[1] + '"></iframe></div>' +
      '<div class="dim tiny mt-8">' + (p.lat ? "GPS: " + p.lat + ", " + p.lng : "Approximate location for " + (p.city || "—")) + '</div></div></div>';
    return html;
  }

  function dealRisk(m, rec, raw) {
    const risk = rec.risk;
    let html = '<div class="grid grid-3 mb-24">' +
      kpi("Risk Score", risk.score + "/100", "higher = safer", risk.score >= 70 ? "green" : risk.score >= 50 ? "gold" : "red", "shield") +
      kpi("Investment Score", rec.loc.investmentScore + "/100", "AI blend", "blue", "target") +
      kpi("Overall Grade", rec.grade, rec.total + "/100", rec.pass ? "green" : "red", "check") + '</div>';
    html += '<div class="card card-pad"><h3 class="mb-16">Risk Register <span class="badge ai">AI</span></h3>';
    risk.risks.forEach(r => {
      const col = r.level === "high" ? "var(--red)" : r.level === "medium" ? "var(--gold)" : "var(--accent)";
      html += '<div class="risk-item"><span class="risk-dot ' + r.level + '"></span><div class="grow"><div style="display:flex;justify-content:space-between;gap:10px"><b>' + r.name + '</b><span class="badge ' + (r.level === "high" ? "red" : r.level === "medium" ? "gold" : "green") + '">' + r.level.toUpperCase() + '</span></div><div class="dim tiny mt-8">' + r.mitigation + '</div><div class="faint tiny mt-8">Basis: ' + r.basis + '</div></div></div>';
    });
    html += '</div>';
    html += '<div class="card card-pad mt-24"><h3 class="mb-16">AI Recommendation Summary</h3><div class="ai-banner">' + icon("spark", 14) + '<span>' + esc(rec.verdict) + ' Strengths: ' + esc(rec.strengths.join(" · ") || "—") + '. Weaknesses: ' + esc(rec.weaknesses.join(" · ") || "—") + '. Hidden risks: ' + esc(rec.hiddenRisks.join(" · ") || "None identified.") + '</span></div>' +
      '<p class="dim tiny mt-16">This is an automated analysis for informational purposes only and does not constitute licensed financial, legal, or investment advice.</p></div>';
    return html;
  }

  /* ================= DASHBOARD ================= */
  function siteContactDefaults() {
    return { eyebrow: "TALK TO A SHOPHOUSE SPECIALIST", title: "Ready to put the ground floor to work?", description: "Tell us your province, budget, and business plan. A shophouse specialist from ES Realty will reply within one business day with listings and next steps.", phone: "+63 900 000 0000", email: "hello@esrealty.ph", address: "Batangas, Philippines", hours: "Monday–Saturday, 9:00 AM–6:00 PM" };
  }
  function siteContactData() {
    state.siteContact = Object.assign(siteContactDefaults(), state.siteContact || {});
    return state.siteContact;
  }
  function renderSiteContactAdmin() {
    if (!roleIs("super-admin")) return "";
    const c = siteContactData();
    return '<div class="card card-pad mb-24"><div class="row spread" style="gap:12px;flex-wrap:wrap"><div><div class="dim tiny">PUBLIC WEBSITE</div><h3 class="mt-8">Contact Us</h3><p class="dim mt-8">These details appear in the main-page Contact Us section.</p></div><button class="btn btn-primary btn-sm" id="edit-site-contact">' + icon("edit", 13) + ' Edit Contact Us</button></div><div class="grid grid-4 mt-16"><div><div class="dim tiny">Phone</div><b>' + esc(c.phone || "—") + '</b></div><div><div class="dim tiny">Email</div><b>' + esc(c.email || "—") + '</b></div><div><div class="dim tiny">Location</div><b>' + esc(c.address || "—") + '</b></div><div><div class="dim tiny">Hours</div><b>' + esc(c.hours || "—") + '</b></div></div></div>';
  }
  function openSiteContactEditor() {
    if (!roleIs("super-admin")) return;
    const c = siteContactData();
    const field = (label, id, value, type) => '<div class="field"><label>' + label + '</label><input class="input" id="' + id + '" type="' + (type || "text") + '" value="' + esc(value || "") + '"></div>';
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "site-contact-modal";
    ov.innerHTML = '<div class="modal-card modal-card-wide"><div class="modal-head"><h3>Edit Contact Us</h3><button class="icon-btn" data-site-contact-cancel title="Close">&times;</button></div><div class="modal-body"><div class="grid grid-2">' +
      field("Eyebrow", "sc-eyebrow", c.eyebrow) + field("Headline", "sc-title", c.title) +
      '<div class="field" style="grid-column:span 2"><label>Description</label><textarea class="input" id="sc-description" rows="3">' + esc(c.description || "") + '</textarea></div>' +
      field("Phone", "sc-phone", c.phone, "tel") + field("Email", "sc-email", c.email, "email") + field("Address / Location", "sc-address", c.address) + field("Business Hours", "sc-hours", c.hours) +
      '</div></div><div class="modal-foot"><button class="btn btn-ghost" data-site-contact-cancel>Cancel</button><button class="btn btn-primary" data-site-contact-save>' + icon("check", 15) + " Save Contact Us</button></div></div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
  }
  let siteContactHooked = false;
  function bindSiteContact() {
    if (siteContactHooked) return;
    siteContactHooked = true;
    document.addEventListener("click", function siteContactHandler(e) {
      if (e.target.closest("#edit-site-contact")) { openSiteContactEditor(); return; }
      if (e.target.closest("[data-site-contact-cancel]")) { const modal = $("#site-contact-modal"); if (modal) modal.remove(); return; }
      if (!e.target.closest("[data-site-contact-save]")) return;
      const c = siteContactData();
      const value = id => { const el = $("#" + id); return el ? el.value.trim() : ""; };
      c.eyebrow = value("sc-eyebrow"); c.title = value("sc-title"); c.description = value("sc-description"); c.phone = value("sc-phone"); c.email = value("sc-email"); c.address = value("sc-address"); c.hours = value("sc-hours");
      const modal = $("#site-contact-modal"); if (modal) modal.remove();
      save(); render(); toast("Contact Us details updated");
    });
  }
  function renderListingAccountDashboard() {
    const saved = cloudSavedListings || [];
    const mine = cloudMyListings || [];
    let html = '<div class="hero listing-dashboard-hero"><div><span class="sf-eyebrow">MY PROPERTY SPACE</span><h1>Welcome back, ' + esc((currentUser && currentUser.name) || "there") + '</h1><p>Keep your shortlist and property activity in one place.</p></div><div class="actions"><button class="btn btn-ghost" data-view="listings">Browse Listings</button>';
    if (listingCanManage()) html += '<button class="btn btn-primary" data-ls-new>' + icon("plus", 15) + ' New Listing</button>';
    html += '</div></div>';
    html += '<div class="grid grid-3 mb-24">' +
      kpi("Saved Properties", String(saved.length), "your current shortlist", "green", "star") +
      kpi("Available Listings", String((state.listings || []).filter(lsLive).length), "published inventory", "blue", "home") +
      kpi(listingCanManage() ? "My Listings" : "Account", listingCanManage() ? String(mine.length) : roleLabel(userRole()), listingCanManage() ? "drafts and published" : "approved access", "gold", "briefcase") + '</div>';
    html += '<section class="account-listing-section"><div class="section-title-row"><div><h2>Saved properties</h2><p class="dim">Properties you want to revisit.</p></div><button class="btn btn-ghost btn-sm" data-view="listings">Explore more</button></div>';
    html += saved.length ? '<div class="ls-grid">' + saved.slice(0, 6).map(listingCard).join("") + '</div>' : '<div class="sf-empty compact"><div>♡</div><h3>Your shortlist is empty</h3><p>Save properties from the listings page to compare them here.</p></div>';
    html += '</section>';
    if (listingCanManage()) {
      html += '<section class="account-listing-section mt-24"><div class="section-title-row"><div><h2>My listings</h2><p class="dim">Manage drafts and published inventory.</p></div><button class="btn btn-primary btn-sm" data-ls-new>' + icon("plus", 14) + ' Add listing</button></div>';
      html += mine.length ? '<div class="ls-grid">' + mine.slice(0, 6).map(listingCard).join("") + '</div>' : '<div class="sf-empty compact"><div>＋</div><h3>No listings yet</h3><p>Create a draft, add property details, then publish when it is ready.</p></div>';
      html += '</section>';
    }
    return html;
  }
  function renderDashboard() {
    const listingDashboard = renderListingAccountDashboard();
    if (!roleIs("super-admin")) return listingDashboard;
    const ps = portfolioStats();
    let html = listingDashboard + renderSiteContactAdmin() + '<div class="hero mt-24"><div><h1>Investment overview</h1><p>Portfolio performance and analysis tools.</p></div><div class="actions"><button class="btn btn-primary" data-view="wizard">' + icon("plus", 15) + " New Investment</button></div></div>";
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Portfolio Value", C.money(ps.value), ps.count + " properties", "green", "briefcase") +
      kpi("Net Worth", C.money(ps.netWorth), "value − loans", "blue", "trending") +
      kpi("Annual Cash Flow", C.money(ps.cashflow), "rental + sales", "purple", "dollar") +
      kpi("Outstanding Loans", C.money(ps.loan), "across portfolio", "gold", "doc") + '</div>';
    html += '<div class="grid grid-2 mb-24"><div class="card card-pad"><h3 class="mb-16">Recent Deals</h3><div class="table-wrap"><table class="data"><tr><th>Property</th><th>Status</th><th class="num">ROI</th><th>Grade</th></tr>';
    const recent = state.deals.slice(-5).reverse();
    if (!recent.length) {
      html += '<tr><td colspan="4" class="dim" style="text-align:center;padding:20px">No deals yet — create your first investment.</td></tr>';
    } else {
      recent.forEach(d => {
        const rec = C.recommend(d.data);
        html += '<tr style="cursor:pointer" data-open-deal="' + d.id + '"><td>' + esc(d.data.property.name) + '</td><td>' + statusBadge(d.status) + '</td><td class="num">' + C.pct(C.model(d.data).returns.roi) + '</td><td><span class="badge ' + (rec.pass ? "green" : "red") + '">' + rec.grade + '</span></td></tr>';
      });
    }
    html += '</table></div></div>';
    html += '<div class="card card-pad"><h3 class="mb-16">Modules</h3><div class="module-grid">' +
      '<div class="module-card" data-view="wizard">' + icon("plus", 22) + "<h4>New Investment</h4><p>Input a property and run AI feasibility.</p><span class='module-tag'>Explore →</span></div>" +
      '<div class="module-card" data-view="portfolio">' + icon("briefcase", 22) + "<h4>Portfolio</h4><p>Manage saved properties and rollups.</p><span class='module-tag'>Explore →</span></div>" +
      '<div class="module-card" data-view="assistant">' + icon("chat", 22) + "<h4>AI Assistant</h4><p>Ask about your property analysis.</p><span class='module-tag'>Explore →</span></div>" +
      '<div class="module-card" data-view="reports">' + icon("file", 22) + "<h4>Reports</h4><p>Export PDF and Excel deliverables.</p><span class='module-tag'>Explore →</span></div>" +
      '</div></div></div>';
    return html;
  }

  /* ================= PORTFOLIO ================= */
  function renderPortfolio() {
    const ps = portfolioStats();
    let html = '<div class="hero"><div><h1>Portfolio</h1><p>All your saved investments.</p></div><div class="actions"><button class="btn btn-primary" data-view="wizard">' + icon("plus", 15) + " New Investment</button></div></div>";
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Portfolio Value", C.money(ps.value), ps.count + " properties", "green", "briefcase") +
      kpi("Net Worth", C.money(ps.netWorth), "value − loans", "blue", "trending") +
      kpi("Cash Flow", C.money(ps.cashflow), "annual", "purple", "dollar") +
      kpi("Sold Profit", C.money(ps.soldProfit), "realized", "gold", "check") + '</div>';
    html += '<div class="card card-pad"><h3 class="mb-16">Deals</h3>';
    if (!state.deals.length) {
      html += '<div class="empty"><h3>No properties yet</h3><p>Create your first investment to build your portfolio.</p><button class="btn btn-primary" data-view="wizard">' + icon("plus", 15) + " New Investment</button></div>";
    } else {
      html += '<div class="table-wrap"><table class="data"><tr><th>Property</th><th>Location</th><th>Status</th><th class="num">Investment</th><th class="num">Profit</th><th class="num">ROI</th><th>Grade</th><th>Actions</th></tr>';
      state.deals.forEach(d => {
        const m = C.model(d.data), rec = C.recommend(d.data);
        const cfg = statusCfg(d.status);
        html += '<tr><td style="cursor:pointer" data-open-deal="' + d.id + '">' + esc(d.data.property.name) + '</td><td>' + esc(d.data.property.city) + '</td>' +
          '<td><div class="row" style="gap:6px">' + statusBadge(d.status) + statusSelect(d) + '</div>' +
          (cfg ? '<div class="dim tiny" style="margin-top:4px">' + esc(cfg.note) + '</div>' : "") + '</td>' +
          '<td class="num">' + C.money(m.returns.investment) + '</td><td class="num">' + C.money(m.returns.profit) + '</td><td class="num">' + C.pct(m.returns.roi) + '</td>' +
          '<td><span class="badge ' + (rec.pass ? "green" : "red") + '">' + rec.grade + '</span></td>' +
          '<td><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-edit-deal="' + d.id + '" title="Edit in Wizard">' + icon("edit", 13) + '</button><button class="btn btn-danger btn-sm" data-delete-deal="' + d.id + '">' + icon("trash", 13) + '</button></div></td></tr>';
      });
      html += '</table></div>';
      html += '<div class="row mt-16" style="gap:8px;flex-wrap:wrap">' + statusSummary() + '</div>';
    }
    html += '</div>';
    return html;
  }

  /* ================= ASSISTANT ================= */
  function renderAssistant() {
    let html = '<div class="hero"><div><h1>AI Assistant</h1><p>Ask about the loaded property. AI answers use your saved data.</p></div></div>';
    html += '<div class="two-col"><div class="card card-pad"><h3 class="mb-16">' + icon("chat", 15) + ' Chat</h3><div class="chat-log" id="chat-log">' +
      '<div class="msg bot">Hi! I can analyze the loaded property. Ask me about ROI, cash required, risk, location, negotiation price, or the overall grade.</div></div>' +
      '<div class="row mt-16"><input class="input grow" id="chat-in" placeholder="e.g. What is the projected ROI?" style="font-family:var(--font-sans)"><button class="btn btn-primary" id="chat-send">Send</button></div>' +
      '<div class="chip-row mt-16" id="chat-sugs">' +
      ["What is the projected ROI?", "How much cash do I need?", "What are the top risks?", "Should I negotiate the price?"].map(s => '<span class="chat-sug">' + s + '</span>').join("") +
      '</div></div>' +
      '<div class="card card-pad"><h3 class="mb-16">Loaded Property</h3>' +
      (state.current
        ? '<p style="font-size:14px"><b>' + esc(state.current.property.name || "Untitled") + '</b></p><p class="dim tiny">' + esc([state.current.property.barangay, state.current.property.city, state.current.property.province].filter(Boolean).join(", ") || "No location") + '</p>'
        : '<p class="dim">No property loaded. Use New Investment or open a portfolio deal first.</p>') +
      '</div></div>';
    return html;
  }

  function bindAssistant() {
    const log = $("#chat-log"), inp = $("#chat-in"), send = $("#chat-send");
    const reply = q => {
      const msg = document.createElement("div"); msg.className = "msg user"; msg.textContent = q; log.appendChild(msg);
      const bot = document.createElement("div"); bot.className = "msg bot";
      bot.innerHTML = "<div>Thinking…</div>";
      log.appendChild(bot); log.scrollTop = log.scrollHeight;
      setTimeout(() => {
        const a = state.current ? C.assistantAnswer(q, state.current) : "Load a property first so I can analyze it.";
        bot.innerHTML = esc(a) + '<div class="dim tiny mt-8">Automated analysis for informational purposes only — not financial, legal, or investment advice.</div>';
        log.scrollTop = log.scrollHeight;
      }, 500);
    };
    if (send) send.addEventListener("click", () => { const q = inp.value.trim(); if (!q) return; inp.value = ""; reply(q); });
    if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter" && send) send.click(); });
    $$("#chat-sugs .chat-sug").forEach(b => b.addEventListener("click", () => reply(b.textContent)));
  }

  /* ================= REPORTS ================= */
  function reportRaw() {
    return state.current || ((state.deals || []).length ? state.deals[state.deals.length - 1].data : null);
  }
  function renderReports() {
    const raw = reportRaw();
    if (!raw) {
      return '<div class="card card-pad empty">' + icon("file", 50) + "<h3>Nothing to report yet</h3><p>Analyze a deal first, then generate deliverables.</p></div>";
    }
    const name = raw.property.name;
    const meta = [["Property", name], ["Location", [raw.property.barangay, raw.property.city, raw.property.province].filter(Boolean).join(", ")], ["Generated", new Date().toLocaleString()]];

    let html = '<div class="hero"><div><h1>Report Generator</h1><p>Deliverables for: <b>' + esc(name) + '</b></p></div></div>';
    html += '<div class="grid grid-3">' +
      '<div class="card scenario" data-report="exec">' + icon("file", 16) + '<div class="sc-name" style="margin-top:6px">Executive Summary</div><div class="sc-sub">One-page verdict with grade and key metrics.</div><span class="badge blue mt-8">PDF</span></div>' +
      '<div class="card scenario" data-report="summary">' + icon("doc", 16) + '<div class="sc-name" style="margin-top:6px">Deal Summary</div><div class="sc-sub">Complete investment details, costs, returns, risks, and comparables.</div><span class="badge blue mt-8">PDF</span></div>' +
      '<div class="card scenario" data-report="bank">' + icon("dollar", 16) + '<div class="sc-name" style="margin-top:6px">Bank Loan Report</div><div class="sc-sub">Loan terms and amortization schedule.</div><span class="badge gold mt-8">Excel</span></div>' +
      '<div class="card scenario" data-report="feas">' + icon("layers", 16) + '<div class="sc-name" style="margin-top:6px">Feasibility Study</div><div class="sc-sub">Full cost, revenue, returns and scenarios.</div><span class="badge blue mt-8">PDF</span></div>' +
      '<div class="card scenario" data-report="budget">' + icon("briefcase", 16) + '<div class="sc-name" style="margin-top:6px">Construction Budget</div><div class="sc-sub">Line-item development cost breakdown.</div><span class="badge green mt-8">CSV</span></div>' +
      '<div class="card scenario" data-report="fin">' + icon("trending", 16) + '<div class="sc-name" style="margin-top:6px">Financial Statements</div><div class="sc-sub">Summary, costs, cash flow, amortization.</div><span class="badge gold mt-8">Excel</span></div>' +
      '<div class="card scenario" data-report="amort">' + icon("chart", 16) + '<div class="sc-name" style="margin-top:6px">Amortization Schedule</div><div class="sc-sub">Monthly repayment schedule export.</div><span class="badge green mt-8">CSV</span></div>' +
      '</div>';
    html += '<div class="card card-pad mt-24"><h3 class="mb-16">Report Preview</h3><div class="ai-banner">' + icon("spark", 14) + ' <span>Reports pull live data from the loaded property record. In production, PDF generation uses react-pdf/Puppeteer and Excel uses exceljs.</span></div><div class="row mt-16" style="gap:10px">' +
      '<button class="btn btn-ghost btn-sm" id="preview-exec">Preview Executive Summary</button>' +
      '<button class="btn btn-ghost btn-sm" id="preview-feas">Preview Feasibility</button>' +
      '<button class="btn btn-ghost btn-sm" id="preview-summary">Preview Deal Summary</button></div></div>';
    return html;
  }

  function reportHTML(title, meta, sections, accent) {
    const rows = meta.map(m => "<tr><td><b>" + esc(m[0]) + "</b></td><td>" + esc(m[1]) + "</td></tr>").join("");
    const secs = sections.map(s => "<h2>" + esc(s.title) + "</h2>" + (s.html || "")).join("");
    return '<div class="rpt" style="font-family:Georgia,serif;color:#16202E;line-height:1.6;max-width:820px;margin:0 auto;padding:32px">' +
      '<h1 style="color:' + (/^#[0-9A-Fa-f]{6}$/.test(accent || "") ? accent : "#EA580C") + ';font-size:26px">' + esc(title) + '</h1>' +
      '<p style="font-size:11px;color:#98A5B8">ES Realty Investment Intelligence · ' + new Date().toLocaleString() + '</p>' +
      '<table>' + rows + '</table>' + secs +
      '<p style="font-size:10px;color:#98A5B8;margin-top:28px;border-top:1px solid #E3E8EF;padding-top:8px">This is an automated analysis for informational purposes only and does not constitute licensed financial, legal, or investment advice.</p></div>';
  }

  function printHTML(html) {
    const root = $("#print-root");
    root.innerHTML = html;
    root.style.display = "block";
    window.print();
    setTimeout(() => { root.innerHTML = ""; root.style.display = "none"; }, 500);
  }

  function genReport(type, raw) {
    if (!raw) { toast("Load an investment before generating a report", "err"); return; }
    const m = C.model(raw), rec = C.recommend(raw);
    const name = raw.property.name;
    const meta = [["Property", name], ["Location", [raw.property.barangay, raw.property.city, raw.property.province].filter(Boolean).join(", ") || "—"], ["Grade", rec.grade + " (" + rec.total + "/100)"], ["Verdict", rec.verdict], ["Generated", new Date().toLocaleString()]];

    if (type === "summary") {
      printHTML(dealSummaryReportHTML(raw));
    } else if (type === "exec") {
      const t2 = (k, v) => "<tr><td><b>" + k + "</b></td><td>" + v + "</td></tr>";
      const s1 = '<table>' + t2("Total Investment", C.money(m.returns.investment)) + t2("Total Development Cost", C.money(m.returns.totalDevCost)) + t2("Gross Revenue", C.money(m.returns.grossRevenue)) + t2("Net Profit", C.money(m.returns.profit)) + t2("ROI", C.pct(m.returns.roi)) + t2("IRR", C.pct(m.returns.irr)) + t2("NPV", C.money(m.returns.npv)) + t2("Equity Required", C.money(m.acquisition.equity)) + t2("Best Use", rec.hbu.recommendation.label) + t2("Suggested Offer", C.money(rec.suggestedOffer)) + t2("Max Price", C.money(rec.maxPrice)) + "</table>";
      const s2 = "<h3>Recommendation</h3><p>" + rec.verdict + "</p><h3>Strengths</h3><ul>" + rec.strengths.map(x => "<li>" + x + "</li>").join("") + "</ul><h3>Weaknesses</h3><ul>" + rec.weaknesses.map(x => "<li>" + x + "</li>").join("") + "</ul>";
      printHTML(reportHTML("Executive Investment Summary", meta, [{ title: "Key Metrics", html: s1 }, { title: "AI Recommendation", html: s2 }], "#EA580C"));
    } else if (type === "feas") {
      const scs = C.buildAllScenarios(raw).sort((x, y) => (y.m.returns.roi * 100 + y.m.returns.irr * 60) - (x.m.returns.roi * 100 + x.m.returns.irr * 60));
      const scHtml = "<table><tr><th>Scenario</th><th>Investment</th><th>Profit</th><th>ROI</th><th>IRR</th><th>Timeline</th></tr>" + scs.map(s => "<tr><td>" + s.label + "</td><td>" + C.money(s.m.returns.investment) + "</td><td>" + C.money(s.m.returns.profit) + "</td><td>" + C.pct(s.m.returns.roi) + "</td><td>" + C.pct(s.m.returns.irr) + "</td><td>" + s.m.returns.holdYears + " yrs</td></tr>").join("") + "</table>";
      const dd = m.development;
      const dev = '<table><tr><th>Line Item</th><th>Amount</th></tr>' + [
        ["Construction", dd.construction], ["Site Development", dd.siteDev], ["Professional Fees", dd.profFees], ["Permits", dd.permits], ["Contingency", dd.contingency], ["Carrying during build", dd.carrying], ["Marketing", dd.marketing], ["Financing", m.financingCost], ["TOTAL", dd.total + m.financingCost]
      ].map(r => "<tr><td>" + r[0] + "</td><td>" + C.money(r[1]) + "</td></tr>").join("") + "</table>";
      printHTML(reportHTML("Development Feasibility Study", meta, [{ title: "Development Cost", html: dev }, { title: "Scenario Analysis", html: scHtml }], "#EA580C"));
    } else if (type === "bank") {
      const rows = [["Term", m.acquisition.finType], ["Loan %", C.pct(m.acquisition.loanPct)], ["Loan Amount", C.money(m.acquisition.loanAmount)], ["Monthly Payment", C.money(m.acquisition.monthly)], ["Total Interest", C.money(m.acquisition.totalInterest)]];
      const sched = [];
      let bal = m.acquisition.loanAmount, monthly = m.acquisition.monthly;
      const n = Math.min(12 * 5, m.acquisition.totalPayment > 0 ? Math.ceil(m.acquisition.loanAmount / monthly) : 0);
      for (let i = 1; i <= n && bal > 0; i++) {
        const interest = bal * (m.acquisition.finType === "Cash" ? 0 : C.num((raw.financing.interestRate || 7.5), 7.5) / 100 / 12);
        const principal = Math.min(monthly - interest, bal);
        bal = Math.max(0, bal - principal);
        sched.push([i, monthly, principal, interest, bal]);
      }
      exportXLS(name.replace(/\W+/g, "_") + "_bank_loan.xls", [{ name: "Loan Terms", headers: ["Term", "Value"], rows: rows }, { name: "Amortization", headers: ["Month", "Payment", "Principal", "Interest", "Balance"], rows: sched }]);
      toast("Bank loan report downloaded (Excel)");
    } else if (type === "budget") {
      const dd = m.development;
      const rows = [["Land acquisition", m.acquisition.acquisitionCost], ["Construction", dd.construction], ["Site development", dd.siteDev], ["Professional fees", dd.profFees], ["Permits", dd.permits], ["Contingency", dd.contingency], ["Carrying during build", dd.carrying], ["Financing cost", m.financingCost], ["Marketing", dd.marketing], ["TOTAL", dd.total + m.financingCost]];
      exportCSV(name.replace(/\W+/g, "_") + "_budget.csv", [["Line Item", "Amount"], ...rows.map(r => [r[0], String(r[1])])]);
      toast("Construction budget downloaded (CSV)");
    } else if (type === "fin") {
      exportXLS(name.replace(/\W+/g, "_") + "_financials.xls", [
        { name: "Summary", headers: ["Metric", "Value"], rows: [["Total Cost", m.returns.investment], ["Gross Revenue", m.returns.grossRevenue], ["Net Revenue", m.returns.netRevenue], ["Annual NOI", m.returns.noi], ["Profit", m.returns.profit], ["ROI", C.pct(m.returns.roi)], ["IRR", C.pct(m.returns.irr)], ["NPV", C.money(m.returns.npv)], ["Cap Rate", C.pct(m.returns.capRate)]] },
        { name: "Development Cost", headers: ["Line", "Amount"], rows: [["Construction", m.development.construction], ["Site Dev", m.development.siteDev], ["Prof Fees", m.development.profFees], ["Permits", m.development.permits], ["Contingency", m.development.contingency], ["Carrying during build", m.development.carrying], ["Total", m.development.total]] },
        { name: "Cash Flow", headers: ["Period", "Cash Flow"], rows: m.returns.cashflows.map((cf, i) => [(i === 0 ? "Now" : "Year " + i), String(cf)]) }
      ]);
      toast("Financial statements downloaded (Excel)");
    } else if (type === "amort") {
      let bal = m.acquisition.loanAmount, monthly = m.acquisition.monthly;
      const n = Math.ceil(m.acquisition.loanAmount / Math.max(1, monthly));
      const sched = [];
      for (let i = 1; i <= n && bal > 0; i++) {
        const interest = bal * C.num((raw.financing.interestRate || 7.5), 7.5) / 100 / 12;
        const principal = Math.min(monthly - interest, bal);
        bal = Math.max(0, bal - principal);
        sched.push([i, monthly, principal, interest, bal]);
      }
      exportCSV(name.replace(/\W+/g, "_") + "_amortization.csv", [["Month", "Payment", "Principal", "Interest", "Balance"], ...sched]);
      toast("Amortization schedule downloaded (CSV)");
    }
  }

  function exportCSV(filename, rows) {
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\r\n");
    download(filename, "data:text/csv;charset=utf-8," + encodeURIComponent(csv));
  }
  function exportXLS(filename, sheets) {
    let html = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:x='urn:schemas-microsoft-com:office:excel'><head><meta charset='utf-8'><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>";
    sheets.forEach((sh, i) => { html += "<x:ExcelWorksheet><x:Name>" + sh.name + "</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>"; });
    html += "</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>";
    sheets.forEach(sh => {
      html += "<table><tr><th>" + sh.headers.map(h => "<th>" + h + "</th>").join("") + "</th></tr>";
      sh.rows.forEach(r => { html += "<tr>" + r.map(v => "<td>" + String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</td>").join("") + "</tr>"; });
      html += "</table><br>";
    });
    html += "</body></html>";
    download(filename, "data:application/vnd.ms-excel;charset=utf-8," + encodeURIComponent(html));
  }
  function download(filename, dataUrl) {
    const a = document.createElement("a");
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function bindReports() {
    $$("#content [data-report]").forEach(b => b.addEventListener("click", () => {
      genReport(b.getAttribute("data-report"), reportRaw());
    }));
    const pe = $("#preview-exec"), pf = $("#preview-feas");
    const ps = $("#preview-summary");
    if (pe) pe.addEventListener("click", () => { genReportToScreen("exec", reportRaw()); });
    if (pf) pf.addEventListener("click", () => { genReportToScreen("feas", reportRaw()); });
    if (ps) ps.addEventListener("click", () => { genReportToScreen("summary", reportRaw()); });
  }

  function genReportToScreen(type, raw) {
    if (!raw) { toast("Load an investment before previewing a report", "err"); return; }
    if (type === "summary") {
      const root = $("#print-root");
      root.innerHTML = dealSummaryReportHTML(raw);
      root.style.display = "block";
      root.scrollIntoView({ behavior: "smooth" });
      toast("Preview ready — press Ctrl+P to save as PDF");
      return;
    }
    const m = C.model(raw), rec = C.recommend(raw);
    const name = raw.property.name;
    const meta = [["Property", name], ["Location", [raw.property.barangay, raw.property.city, raw.property.province].filter(Boolean).join(", ") || "—"], ["Grade", rec.grade + " (" + rec.total + "/100)"], ["Verdict", rec.verdict], ["Generated", new Date().toLocaleString()]];
    if (type === "exec") {
      const t2 = (k, v) => "<tr><td><b>" + k + "</b></td><td>" + v + "</td></tr>";
      const s1 = '<table>' + t2("Total Investment", C.money(m.returns.investment)) + t2("Net Profit", C.money(m.returns.profit)) + t2("ROI", C.pct(m.returns.roi)) + t2("IRR", C.pct(m.returns.irr)) + t2("Equity Required", C.money(m.acquisition.equity)) + t2("Best Use", rec.hbu.recommendation.label) + "</table>";
      const s2 = "<h3>Recommendation</h3><p>" + rec.verdict + "</p><h3>Strengths</h3><ul>" + rec.strengths.map(x => "<li>" + x + "</li>").join("") + "</ul><h3>Weaknesses</h3><ul>" + rec.weaknesses.map(x => "<li>" + x + "</li>").join("") + "</ul>";
      const root = $("#print-root");
      root.innerHTML = reportHTML("Executive Investment Summary", meta, [{ title: "Key Metrics", html: s1 }, { title: "AI Recommendation", html: s2 }], "#EA580C");
      root.style.display = "block";
      root.scrollIntoView({ behavior: "smooth" });
      toast("Preview ready — press Ctrl+P to save as PDF");
    } else if (type === "feas") {
      const scs = C.buildAllScenarios(raw).sort((x, y) => (y.m.returns.roi * 100 + y.m.returns.irr * 60) - (x.m.returns.roi * 100 + x.m.returns.irr * 60));
      const scHtml = "<table><tr><th>Scenario</th><th>Investment</th><th>Profit</th><th>ROI</th><th>IRR</th></tr>" + scs.map(s => "<tr><td>" + s.label + "</td><td>" + C.money(s.m.returns.investment) + "</td><td>" + C.money(s.m.returns.profit) + "</td><td>" + C.pct(s.m.returns.roi) + "</td><td>" + C.pct(s.m.returns.irr) + "</td></tr>").join("") + "</table>";
      const root = $("#print-root");
      root.innerHTML = reportHTML("Development Feasibility Study", meta, [{ title: "Scenario Analysis", html: scHtml }], "#EA580C");
      root.style.display = "block";
      root.scrollIntoView({ behavior: "smooth" });
      toast("Preview ready — press Ctrl+P to save as PDF");
    }
  }

  /* ================= DEAL TAB BINDINGS ================= */
  function bindDealContent() {
    $$("#content [data-dtab]").forEach(b => b.addEventListener("click", () => { state.dealTab = b.getAttribute("data-dtab"); save(); render(); }));
    $$("#content [data-scenario]").forEach(b => b.addEventListener("click", () => {
      toast("Scenario selected: <b>" + esc(b.getAttribute("data-scenario")) + "</b> — view in Scenarios tab");
    }));
    const saveDeal = $("#save-deal");
    if (saveDeal) saveDeal.addEventListener("click", () => saveCurrentDeal());
    const makeAppr = $("#make-appraisal");
    if (makeAppr) makeAppr.addEventListener("click", createAppraisalFromDeal);
    const editDeal = $("#edit-deal");
    if (editDeal) editDeal.addEventListener("click", () => { state.wizardStep = 1; save(); navigate("wizard"); toast("Editing this deal in the New Investment wizard"); });
    const dsPreview = $("#ds-preview");
    if (dsPreview) dsPreview.addEventListener("click", () => printDealSummary());
  }

  /* #8 — hand the current deal's property + comparables into a fresh appraisal */
  function createAppraisalFromDeal() {
    const d = state.current;
    if (!d) return;
    const a = freshAppraisal();
    a.propertyName = d.property.name || "";
    a.name = "Appraisal — " + (d.property.name || "Property");
    const pd = {};
    ["name", "region", "province", "city", "barangay", "address", "lat", "lng", "lotArea", "frontage", "depth", "roadWidth", "roadType", "zoning", "landUse", "floodRisk", "propertyType", "growthRate", "titleKind", "titleNo", "lotNo", "surveyNo", "registryDeeds"].forEach(k => {
      if (d.property[k] != null && d.property[k] !== "") pd[k] = d.property[k];
    });
    a.propertyDetails = pd;
    a.comparables = (d.comparables || []).filter(c => C.num(c.price, 0) > 0).map((c, i) => ({
      id: "c" + Date.now() + "-" + i,
      address: c.address || c.city || ("Comparable " + (i + 1)),
      city: c.city || d.property.city || "",
      price: C.num(c.price, 0),
      lotArea: C.num(c.lotArea, 0),
      floorArea: C.num(c.floorArea, 0),
      saleDate: c.date || "",
      transactionType: c.type === "Rental" ? "Listing" : "Arm’s-length Sale",
      source: c.source || "Deal import",
      propertyType: c.propertyType || ""
    }));
    state.appraisal = a;
    normalizeAppraisal(a);
    state.appraisalTab = "setup";
    save();
    navigate("appraisal");
    toast("Appraisal created from this deal — property details and comparables pre-filled");
  }

  /* #12 — one-page printable Deal Summary (mirrors the appraisal print flow) */
  function printDealSummary() {
    const root = $("#print-root");
    let html = "";
    try { html = dealSummaryReportHTML(state.current); }
    catch (e) {
      root.innerHTML = "";
      toast("Could not build the deal summary: " + esc(e.message || String(e)), "err");
      return;
    }
    root.innerHTML = html;
    window.print();
    setTimeout(() => { root.innerHTML = ""; }, 800);
    toast("Print dialog opened — choose 'Save as PDF' as the destination");
  }
  function dealSummaryReportHTML(raw) {
    if (!raw) return "";
    const m = C.model(raw), rec = C.recommend(raw);
    const a = m.acquisition, dd = m.development, r = m.returns;
    const s = raw.sales;
    const t2 = (k, v) => "<tr><td><b>" + k + "</b></td><td>" + v + "</td></tr>";
    const meta = [["Property", raw.property.name || "Untitled"], ["Location", [raw.property.address, raw.property.barangay, raw.property.city, raw.property.province].filter(Boolean).join(", ") || "—"], ["Grade / Verdict", rec.grade + " (" + rec.total + "/100) · " + rec.verdict], ["Generated", new Date().toLocaleString()]];
    const s1 = '<table>' + t2("Total Investment", C.money(r.investment)) + t2("Gross Revenue", C.money(r.grossRevenue)) + t2("Net Revenue", C.money(r.netRevenue)) + t2("Selling Costs", C.money(r.sellingCosts) + " (" + C.pct(r.sellPct) + ")") + t2("Net Profit", C.money(r.profit)) + t2("ROI", C.pct(r.roi)) + t2("IRR", C.pct(r.irr)) + t2("NPV", C.money(r.npv)) + t2("Cash-on-Cash", C.pct(r.cashOnCash)) + t2("Cap Rate", C.pct(r.capRate)) + t2("Payback", r.paybackYears + " yrs") + "</table>";
    const s2 = '<table>' + t2("Purchase Price", C.money(a.price)) + t2("Negotiated Price", C.money(a.negotiated)) + t2("Closing Costs", C.money(a.totalFees)) + t2("Total Acquisition", C.money(a.acquisitionCost)) + t2("Financing", a.finType) + t2("Loan Amount", C.money(a.loanAmount) + (a.isLoan ? " (" + C.pct(a.loanPct) + " · loanable " + C.money(a.loanEligible) + ")" : "")) + t2("Equity Required", C.money(a.equity)) + t2("Monthly Amortization", C.money(a.monthly) + "/mo") + "</table>";
    const devRows = [["Construction", dd.construction], ["Site Development", dd.siteDev], ["Professional Fees", dd.profFees], ["Permits", dd.permits], ["Contingency", dd.contingency], ["Amenities", dd.amenities], ["Carrying during build", dd.carrying], ["Marketing", dd.marketing], ["Financing during construction", m.financingCost], ["TOTAL", dd.total + m.financingCost]];
    const s3 = "<table><tr><th>Line Item</th><th class='num'>Amount</th></tr>" + devRows.map(x => "<tr><td>" + x[0] + "</td><td>" + C.money(x[1]) + "</td></tr>").join("") + "</table>";
    const s4 = '<table>' + t2("Sale Mode", s.saleMode === "sell" ? "Develop & Sell" : s.saleMode === "rent" ? "Buy & Hold / Rent" : "Hybrid") + t2("Gross Revenue", C.money(r.grossRevenue)) + t2("Transfer-Cost Tax Base", C.money(r.taxBase)) + t2("Selling Costs (total)", C.pct(r.sellPct)) + t2("Transfer Costs (total)", C.money(r.transferCost) + " (" + C.pct(r.transferCostPct) + ")") + t2("Capital Gains Tax", C.money(r.cgt) + " (" + C.pct(r.cgtEffectivePct) + ")") + t2("Documentary Stamp Tax", C.money(r.dst) + " (" + C.pct(r.dstEffectivePct) + ")") + t2("LGU Transfer Tax", C.money(r.transferTax) + " (" + C.pct(r.transferTaxEffectivePct) + ")") + t2("Registry of Deeds Fees", C.money(r.registrationFee) + " (" + C.pct(r.registrationFeeEffectivePct) + ")") + t2("Notarial Fees", C.money(r.notarialFee) + " (" + C.pct(r.notarialFeeEffectivePct) + ")") + t2("Broker Commission", C.money(r.brokerFee) + " (" + C.pct(r.brokerPct) + ")") + t2("VAT", C.money(r.vat) + " (" + C.pct(r.vatPct) + ")") + t2("Annual NOI (rent path)", C.money(r.noi)) + t2("Annual Operating Expenses", C.money(r.annualOpEx)) + t2("Appreciation", C.pct(C.num(s.appreciationRate, 7) / 100)) + t2("Holding Period", C.num(s.holdYears, 10) + " yrs") + "</table>";
    const s5 = '<table>' + t2("Location Score", rec.loc.locationScore + "/100") + t2("Demand Score", rec.loc.demandScore + "/100") + t2("Investment Score", rec.loc.investmentScore + "/100") + t2("Risk Score", rec.risk.score + "/100") + t2("Nearby Types", rec.loc.present + "/" + D.NEARBY_TYPES.length) + "</table><h3>Recommendation</h3><p>" + esc(rec.verdict) + "</p><p><b>Best use:</b> " + esc(rec.hbu.recommendation.label) + "</p>";
    const comps = (raw.comparables || []).filter(c => C.num(c.price, 0) > 0);
    const s6 = comps.length ? "<table><tr><th>#</th><th>Address</th><th>City</th><th>Price</th><th>Lot (sqm)</th><th>Source</th></tr>" + comps.map((c, i) => "<tr><td>" + (i + 1) + "</td><td>" + esc(c.address) + "</td><td>" + esc(c.city) + "</td><td>" + C.money(c.price) + "</td><td>" + C.numFmt(c.lotArea) + "</td><td>" + esc(c.source) + "</td></tr>").join("") + "</table>" : "<p>No comparables recorded.</p>";
    return reportHTML("Investment Deal Summary", meta, [
      { title: "Key Metrics", html: s1 },
      { title: "Acquisition & Financing", html: s2 },
      { title: "Development Cost", html: s3 },
      { title: "Returns & Disposition", html: s4 },
      { title: "Location & Risk", html: s5 },
      { title: "Comparables", html: s6 }
    ], "#EA580C");
  }

  function saveCurrentDeal() {
    if (!state.current) return;
    const existing = state.deals.find(d => d.id === state.current.id);
    if (existing) {
      existing.data = JSON.parse(JSON.stringify(state.current));
      toast("Deal updated in portfolio");
    } else {
      const rec = C.recommend(state.current);
      state.deals.push({ id: "d" + Date.now(), createdAt: Date.now(), status: "acquired", grade: rec.grade, data: JSON.parse(JSON.stringify(state.current)) });
      toast("Deal saved to portfolio — Grade <b>" + rec.grade + "</b>");
    }
    save();
    render();
  }

  /* ================= APPRAISAL MODULE (PVS 3rd Ed. aligned) ================= */
  function freshAppraisal() {
    const raw = state.current;
    const prop = raw ? raw.property : {};
    const bldgType = raw ? (raw.building || {}).constructionType || "CHB / Masonry" : "CHB / Masonry";
    return {
      id: "appr-" + Date.now(),
      name: "",
      propertyName: (raw ? raw.property.name || "" : ""),
      propertyDetails: {},
      status: "Draft",
      purpose: "Mortgage/Loan Security",
      basisOfValue: "Market Value",
      effectiveDate: new Date().toISOString().slice(0, 10),
      extraordinaryAssumptions: "None",
      scopeOfWork: "",
      comparables: [],
      adjustments: [],
      cost: { landValuePerSqm: 0, rcnPerSqm: (D.CONSTRUCTION_COST[bldgType] || 15000), bldgArea: 0, depPhysical: 0, depFunctional: 0, depEconomic: 0, depNote: "" },
      income: { useIncome: false, gpi: 0, vacancyPct: 5, opexPct: 25, capRate: 0, capRateNote: "", useDcf: false },
      approachResults: {
        sales: { finalValue: null, at: null },
        cost: { finalValue: null, at: null },
        income: { finalValue: null, at: null }
      },
      photos: [],
      reconciliationNotes: "",
      finalValue: null, finalMin: null, finalMax: null,
      finalConfirmed: false, confirmedBy: null, confirmedAt: null,
      cert: { appraiserName: "", prcNo: "", ptrNo: "", date: "", eSignature: false },
      auditLog: [],
      createdAt: Date.now(), updatedAt: Date.now()
    };
  }

  function normalizeAppraisal(a) {
    if (!a) a = freshAppraisal();
    if (typeof a.name !== "string") a.name = "";
    a.status = a.status || "Draft";
    a.purpose = a.purpose || "Mortgage/Loan Security";
    a.basisOfValue = a.basisOfValue || "Market Value";
    a.effectiveDate = a.effectiveDate || new Date().toISOString().slice(0, 10);
    a.extraordinaryAssumptions = a.extraordinaryAssumptions || "None";
    a.scopeOfWork = a.scopeOfWork || "";
    a.reconciliationNotes = a.reconciliationNotes || "";
    a.finalValue = (a.finalValue != null) ? a.finalValue : null;
    a.finalMin = (a.finalMin != null) ? a.finalMin : null;
    a.finalMax = (a.finalMax != null) ? a.finalMax : null;
    a.finalConfirmed = a.finalConfirmed || false;
    a.confirmedBy = a.confirmedBy || null;
    a.confirmedAt = a.confirmedAt || null;
    a.cert = Object.assign({ appraiserName: "", prcNo: "", ptrNo: "", date: "", eSignature: false }, a.cert || {});
    a.income = Object.assign({ useIncome: false, gpi: 0, vacancyPct: 5, opexPct: 25, capRate: 0, capRateNote: "", useDcf: false }, a.income || {});
    a.cost = Object.assign({ landValuePerSqm: 0, rcnPerSqm: 15000, bldgArea: 0, depPhysical: 0, depFunctional: 0, depEconomic: 0, depNote: "" }, a.cost || {});
    a.approachResults = a.approachResults || { sales: { finalValue: null, at: null }, cost: { finalValue: null, at: null }, income: { finalValue: null, at: null } };
    ["sales", "cost", "income"].forEach(k => {
      if (!a.approachResults[k] || typeof a.approachResults[k].finalValue === "undefined") a.approachResults[k] = { finalValue: null, at: null };
    });
    if (!Array.isArray(a.photos)) a.photos = [];
    if (!Array.isArray(a.auditLog)) a.auditLog = [];
    if (!Array.isArray(a.comparables)) a.comparables = [];
    if (!Array.isArray(a.adjustments)) a.adjustments = [];
    if (!a.propertyDetails || typeof a.propertyDetails !== "object") a.propertyDetails = {};
    return a;
  }

  const PD_FIELDS = [
    ["name", "Property Name", "col-12", "text"],
    ["address", "Full Address", "col-12", "text"],
    ["region", "Region", "col-6", "region"],
    ["province", "Province", "col-6", "province"],
    ["city", "City / Municipality", "col-6", "city"],
    ["barangay", "Barangay", "col-6", "text"],
    ["lotArea", "Lot Area (sqm)", "col-4", "number"],
    ["frontage", "Frontage (m)", "col-4", "number"],
    ["depth", "Depth (m)", "col-4", "number"],
    ["roadType", "Road Type", "col-6", "text"],
    ["roadWidth", "Road Width (m)", "col-6", "number"],
    ["zoning", "Zoning", "col-6", "text"],
    ["landUse", "Land Use", "col-6", "text"],
    ["floodRisk", "Flood Risk", "col-6", "text"],
    ["propertyType", "Property Type", "col-6", "text"]
  ];

  function apprProperty(a) {
    const base = state.current ? state.current.property : {};
    const pd = a.propertyDetails || {};
    const out = {};
    Object.keys(base).forEach(k => { if (PD_FIELDS.indexOf(k) === -1) out[k] = base[k]; });
    PD_FIELDS.forEach(f => { const k = f[0]; const v = pd[k]; out[k] = (v !== undefined && v !== null && v !== "") ? v : ""; });
    Object.keys(pd).forEach(k => {
      if (PD_FIELDS.indexOf(k) === -1 && k !== "lat" && k !== "lng") {
        const v = pd[k];
        if (v !== undefined && v !== null && v !== "") out[k] = v;
        else if (out[k] === undefined) out[k] = "";
      }
    });
    out.lat = (pd.lat !== undefined && pd.lat !== null && pd.lat !== "") ? pd.lat : "";
    out.lng = (pd.lng !== undefined && pd.lng !== null && pd.lng !== "") ? pd.lng : "";
    out.landPolygon = pd.landPolygon || base.landPolygon || [];
    out.plotArea = pd.plotArea || base.plotArea || 0;
    return out;
  }

  /* The Appraisal module is a standalone feature: it runs with no New
   * Investment deal loaded. Returns the subject in deal shape — the live
   * wizard deal when present (prefill convenience), otherwise synthesized
   * from the appraisal's own Property Details so the approaches, charts,
   * narrative, and report all operate on the appraisal's own data. */
  function appraisalSubjectRaw(a) {
    if (state.current) return state.current;
    const p = apprProperty(a);
    const property = {
      name: p.name || "", region: p.region || "", province: p.province || "", city: p.city || "",
      barangay: p.barangay || "", address: p.address || "", lat: p.lat || "", lng: p.lng || "",
      lotArea: C.num(p.lotArea, 0), frontage: C.num(p.frontage, 0), depth: C.num(p.depth, 0),
      roadWidth: C.num(p.roadWidth, 0), roadType: p.roadType || "", landUse: p.landUse || "",
      zoning: p.zoning || "", floodRisk: p.floodRisk || "", propertyType: p.propertyType || "Vacant Lot",
      structureType: p.structureType || "", marketValuePerSqm: C.num(p.marketValuePerSqm, 0) || D.benchmarkFor(p.city),
      growthRate: C.num(p.growthRate, 0.07), birZonalPerSqm: p.birZonalPerSqm || 0,
      landPolygon: p.landPolygon || [], plotArea: p.plotArea || 0
    };
    return {
      property,
      purchase: { price: 0, negotiatedPrice: 0 },
      financing: { type: "Bank Loan", loanPct: 0, interestRate: 7.5, years: 15 },
      development: { devType: property.propertyType || "Vacant Lot", floorArea: 0, buildMonths: 0, constCostPerSqm: 0, siteDevPct: 8, profFeesPct: 6, permits: 0, contingencyPct: 10, carryingMonthly: 0 },
      sales: { saleMode: "sell", sellPricePerSqm: 0, saleablePct: 82, cgtPct: 6, dstPct: 1.5, registrationFeePct: 0.25, notarialFeePct: 0.5, cgtAmount: 0, dstAmount: 0, transferTaxAmount: 0, registrationFeeAmount: 0, notarialFeeAmount: 0, brokerPct: 3, vatPct: 0, sellingCostPct: 5, appreciationRate: 7, holdYears: 7, discountRate: 10 },
      location: {},
      building: { constructionType: property.structureType || "CHB / Masonry" }
    };
  }

  function sampleComparables(a) {
    const p = state.current ? state.current.property : (a ? apprProperty(a) : {});
    const bench = D.benchmarkFor(p.city);
    const base = Math.round((p.marketValuePerSqm || bench) * 0.95);
    const lot = Math.round(p.lotArea || 200);
    const city = p.city || "Imus";
    const near = ["Imus", "Bacoor", "General Trias", "Silang", "Trece Martires", "Santa Rosa"];
    const mk = (i, off, months, tx) => ({
      id: "c" + Date.now() + "-" + i, address: "Sample comparable " + i, city: near[(near.indexOf(city) + i) % near.length],
      lat: "", lng: "", price: Math.round((base * (1 + off)) * lot), saleDate: "202" + (i) + "-0" + (i + 1) + "-15",
      lotArea: Math.round(lot * (1 - i * 0.08)), floorArea: 0, propertyType: p.propertyType || "Vacant Lot",
      transactionType: tx || "Arm\u2019s-length Sale", source: "Sample data (replace)", sample: true
    });
    return [mk(1, 0.04, 3), mk(2, -0.02, 8, "Listing"), mk(3, 0.1, 12)];
  }

  function activeAppraisal() {
    if (!state.appraisal) {
      state.appraisal = freshAppraisal();
      state.appraisal.comparables = sampleComparables(state.appraisal);
    } else {
      state.appraisal = normalizeAppraisal(state.appraisal);
    }
    return state.appraisal;
  }

  function appraisalAudit(msg, extra) {
    const a = activeAppraisal();
    a.auditLog.push(Object.assign({ ts: Date.now(), user: currentUser ? (currentUser.email || currentUser.name) : "anonymous", msg }, extra || {}));
    a.updatedAt = Date.now();
  }

  function setAppraisalCell(compId, element, value, isAi) {
    const a = activeAppraisal();
    let cell = a.adjustments.find(x => x.comparableId === compId && x.element === element);
    if (cell) { cell.value = value; if (isAi) cell.isAiSuggested = isAi; }
    else { a.adjustments.push({ comparableId: compId, element, value: value, isAiSuggested: isAi || false }); }
    a.updatedAt = Date.now();
  }

  function appraisalSuggestAll() {
    const a = activeAppraisal();
    const raw = appraisalSubjectRaw(a);
    a.adjustments = [];
    (a.comparables || []).forEach(c => {
      const sug = C.appraisalSuggestAdjustments(raw, c, a.effectiveDate);
      C.APPRAISAL_ELEMENTS.forEach(el => {
        const s = sug[el] || { value: 0, basis: "" };
        a.adjustments.push({ comparableId: c.id, element: el, value: s.value, isAiSuggested: true, basis: s.basis });
      });
    });
    appraisalAudit("AI-suggested adjustments generated for " + (a.comparables || []).length + " comparable(s) — each cell is editable and flagged AI-suggested.");
    save();
  }

  function appraisalRes() {
    const a = activeAppraisal();
    const raw = appraisalSubjectRaw(a);
    if (!raw) return null;
    try { return C.appraisalCompute(a, raw); } catch (e) { return null; }
  }

  function appraisalStatusBadge(st) {
    const cls = st === "Certified" ? "green" : (st === "Complete" || st === "Under Review" || st === "In Progress") ? "gold" : "blue";
    return '<span class="badge ' + cls + '">' + esc(st) + '</span>';
  }

  const APPROACH_TITLES = { sales: "Sales Comparison Approach", cost: "Cost Approach", income: "Income Capitalization Approach" };
  function apprFV(a, key) { const r = (a.approachResults || {})[key] || {}; return (r.finalValue != null && !isNaN(r.finalValue)) ? r.finalValue : null; }
  function apprFVAt(a, key) { const r = (a.approachResults || {})[key] || {}; return r.at || null; }
  function apprFVLabel(a, key, fallback) {
    const v = apprFV(a, key);
    if (v == null) return fallback != null ? C.money(fallback) + " (live — not yet saved)" : "—";
    const at = apprFVAt(a, key);
    return C.money(v) + (at ? " · saved " + new Date(at).toLocaleDateString() : "");
  }

  /* ---------- Appraisal view ---------- */
  function renderAppraisal() {
    const a = activeAppraisal();
    const tab = state.appraisalTab || "setup";
    const prop = apprProperty(a);
    const subjName = prop.name || a.propertyName || "Untitled Property";
    const standalone = !state.current;
    let html = '<div class="hero"><div><h1>Appraisal Module</h1><p>' + esc(a.name && a.name.trim() ? a.name : "(appraisal not named yet)") + ' — ' + esc(subjName) + ' · ' + appraisalStatusBadge(a.status) + '</p></div><div class="actions">' +
      (state.current
        ? '<button class="btn btn-ghost btn-sm" data-view="deal">' + icon("chart", 14) + ' Open Deal Analysis</button>'
        : '<button class="btn btn-ghost btn-sm" data-view="wizard">' + icon("plus", 14) + ' Link a New Investment</button>') +
      '</div></div>';
    if (standalone) html += '<div class="notice-banner">' + icon("spark", 14) + ' <span>Standalone appraisal — no New Investment linked. Enter the subject property on the Details tab; link a deal anytime to prefill from it.</span></div>';
    html += '<div class="notice-banner">' + icon("shield", 14) + ' <span>' + APPRAISAL_NOTICE + '</span></div>';
    html += '<div class="tabs">' + APPR_TABS.map(t => '<button class="tab' + (tab === t[0] ? " active" : "") + '" data-atab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>';
    html += '<div class="mt-16">';
    if (tab === "setup") html += apprSetup(a);
    else if (tab === "details") html += apprDetails(a);
    else if (tab === "comps") html += apprComps(a);
    else if (tab === "adjust") html += apprAdjust(a);
    else if (tab === "approaches") html += apprApproaches(a);
    else if (tab === "reconcile") html += apprReconcile(a);
    else if (tab === "charts") html += apprCharts(a);
    else if (tab === "report") html += apprReport(a);
    html += '</div>';
    const idx = APPR_TABS.findIndex(t => t[0] === tab);
    const isLast = idx === APPR_TABS.length - 1;
    html += '<div class="row mt-16" style="justify-content:space-between;gap:10px">' +
      (idx > 0 ? '<button class="btn btn-ghost" data-atab-go="' + APPR_TABS[idx - 1][0] + '">← Back · ' + APPR_TABS[idx - 1][1] + '</button>' : '<span></span>') +
      (isLast ? '<span></span>' : '<button class="btn btn-primary" data-atab-go="' + APPR_TABS[idx + 1][0] + '">Next · ' + APPR_TABS[idx + 1][1] + ' →</button>') +
      '</div>';
    return html;
  }

  function apprSetup(a) {
    const def = VALUE_BASES[a.basisOfValue] || VALUE_BASES["Market Value"];
    let html = '<div class="card card-pad"><div class="row spread mb-16"><h3 style="margin:0">' + icon("doc", 15) + ' Engagement Setup</h3><button class="btn btn-ghost btn-sm" id="ap-reset">' + icon("edit", 14) + ' New Appraisal</button></div><div class="form-grid">';
    html += '<div class="field col-12"><label>Appraisal Name (required)</label><input class="input" id="ap-name" value="' + esc(a.name || "") + '" placeholder="e.g. Appraisal — Acacia Heights Residential Lot"><div class="field-hint">The appraisal autosaves as soon as it is named — manage it under Saved Appraisals on the Report tab.</div></div>';
    html += '<div class="field col-6"><label>Purpose of Valuation</label><select class="input" id="ap-purpose">' + APPRAISAL_PURPOSES.map(x => '<option' + (x === a.purpose ? " selected" : "") + '>' + esc(x) + '</option>').join("") + '</select></div>';
    html += '<div class="field col-6"><label>Basis of Value</label><select class="input" id="ap-basis">' + Object.keys(VALUE_BASES).map(x => '<option' + (x === a.basisOfValue ? " selected" : "") + '>' + esc(x) + '</option>').join("") + '</select></div>';
    html += '<div class="field col-12"><label>Basis Definition Applied</label><div class="basis-def" id="ap-basis-def">' + esc(def) + '</div></div>';
    html += '<div class="field col-6"><label>Effective Date of Valuation</label><input class="input" type="date" id="ap-effect" value="' + esc(a.effectiveDate) + '"><div class="field-hint">Date the value opinion applies to (distinct from report issue date).</div></div>';
    html += '<div class="field col-6"><label>Report Issue Date (auto)</label><input class="input" type="date" value="' + esc(new Date().toISOString().slice(0, 10)) + '" disabled></div>';
    html += '<div class="field col-12"><label>Extraordinary Assumptions / Hypothetical Conditions (required)</label><textarea class="input" id="ap-assump" rows="2" placeholder="State any extraordinary assumptions affecting value, or ' + "'None'" + '">' + esc(a.extraordinaryAssumptions) + '</textarea></div>';
    html += '<div class="field col-12"><label>Scope of Work</label><textarea class="input" id="ap-scope" rows="3" placeholder="What was/wasn' + "'t inspected, data sources relied on." + '">' + esc(a.scopeOfWork) + '</textarea></div>';
    html += '</div></div>';
    html += '<div class="card card-pad mt-16"><h3 class="mb-16">' + icon("camera", 15) + ' Subject Photos <span class="badge blue">' + (a.photos || []).length + '</span></h3>' +
      '<p class="dim tiny">Attach photos of the property. They are stored locally with the appraisal and embedded in the report Addenda. Use one as the cover.</p>' +
      apprPhotosHtml(a) + '</div>';
    return html;
  }

  function apprDetails(a) {
    let html = '<div class="card card-pad"><div class="row spread mb-16"><h3 style="margin:0">' + icon("pin", 15) + ' Property Details & Location</h3></div>' +
      '<p class="dim tiny">Property and location details for THIS appraisal — independent of the New Investment form. Starts blank; type the details here as needed. Printed in the report\u2019s Subject Property Description.</p>' +
      apprPropertyForm(a) + '</div>';
    return html;
  }

  function apprPropertyForm(a) {
    const prop = apprProperty(a);
    const region = prop.region || "";
    const provinces = region ? D.provincesFor(region) : [];
    const cities = (region && prop.province) ? D.citiesFor(region, prop.province) : [];
    let html = '<div class="form-grid">';
    PD_FIELDS.forEach(f => {
      const k = f[0], label = f[1], cls = f[2], type = f[3];
      const val = prop[k];
      if (type === "region") {
        html += '<div class="field ' + cls + '"><label>' + label + '</label><select class="input" data-ap-pd="' + k + '"><option value="">— Select Region —</option>' + D.regionNames().map(r => '<option' + (r === val ? " selected" : "") + '>' + esc(r) + '</option>').join("") + '</select></div>';
      } else if (type === "province") {
        html += '<div class="field ' + cls + '"><label>' + label + '</label><select class="input" data-ap-pd="' + k + '"' + (region ? "" : " disabled") + '><option value="">' + (region ? "— Select Province —" : "Select a region first") + '</option>' + provinces.map(p => '<option' + (p === val ? " selected" : "") + '>' + esc(p) + '</option>').join("") + '</select></div>';
      } else if (type === "city") {
        html += '<div class="field ' + cls + '"><label>' + label + '</label><select class="input" data-ap-pd="' + k + '"' + (prop.province ? "" : " disabled") + '><option value="">' + (prop.province ? "— Select City / Municipality —" : "Select a province first") + '</option>' + cities.map(c => '<option' + (c === val ? " selected" : "") + '>' + esc(c) + '</option>').join("") + '</select></div>';
      } else if (type === "number") {
        html += '<div class="field ' + cls + '"><label>' + label + '</label><input class="input input-num" inputmode="decimal" autocomplete="off" data-ap-pd="' + k + '" value="' + esc(C.fmtNum(val)) + '"></div>';
      } else {
        html += '<div class="field ' + cls + '"><label>' + label + '</label><input class="input" type="' + type + '" data-ap-pd="' + k + '" value="' + esc(val || "") + '"></div>';
      }
    });
    html += '<div class="field col-12"><div class="section-label">' + icon("doc", 12) + ' Land Title &amp; Technical Description</div></div>' +
      '<div class="field col-6"><label>Title Type</label><select class="input" data-ap-pd="titleKind"><option value="">— Select —</option><option value="TCT"' + (prop.titleKind === "TCT" ? " selected" : "") + '>TCT — Transfer Certificate of Title</option><option value="OCT"' + (prop.titleKind === "OCT" ? " selected" : "") + '>OCT — Original Certificate of Title</option><option value="CCT"' + (prop.titleKind === "CCT" ? " selected" : "") + '>CCT — Condominium Certificate of Title</option></select></div>' +
      '<div class="field col-6"><label>Title Number</label><input class="input" data-ap-pd="titleNo" value="' + esc(prop.titleNo || "") + '" placeholder="e.g. T-123456"></div>' +
      '<div class="field col-4"><label>Lot No.</label><input class="input" data-ap-pd="lotNo" value="' + esc(prop.lotNo || "") + '" placeholder="From technical description"></div>' +
      '<div class="field col-4"><label>Survey No.</label><input class="input" data-ap-pd="surveyNo" value="' + esc(prop.surveyNo || "") + '" placeholder="e.g. Pcs-07-002341"></div>' +
      '<div class="field col-4"><label>Registry of Deeds</label><input class="input" data-ap-pd="registryDeeds" value="' + esc(prop.registryDeeds || "") + '" placeholder="City / Province"></div>' +
      '<div class="field col-12"><div class="ai-banner">' + icon("spark", 14) + ' <span>Title reference only — title numbers do not carry map coordinates. Use the plot below to draw the land boundary and record the area.</span></div></div>';
    html += apprMapHtml("ap-map", prop.lat, prop.lng, prop.landPolygon, prop.plotArea);
    html += '</div>';
    return html;
  }

  function apprPhotosHtml(a) {
    const photos = a.photos || [];
    const grid = photos.length ? '<div class="photo-grid" id="ap-photo-grid">' + photos.map((p, i) => {
      const cover = p.cover ? ' class="photo-card cover"' : ' class="photo-card"';
      return '<div' + cover + '>' +
        '<div class="photo-thumb"><img src="' + p.dataUrl + '" alt="' + esc(p.caption || p.name || "Subject photo") + '"><span class="photo-cover-badge">' + icon("star", 11) + ' Cover</span></div>' +
        '<div class="photo-meta"><input class="input photo-cap" data-photo-cap="' + esc(p.id) + '" value="' + esc(p.caption || "") + '" placeholder="Caption (e.g. Front elevation)">' +
        '<div class="row mt-4" style="gap:8px">' + (p.cover ? '<button class="btn btn-ghost btn-sm" data-photo-cover="' + esc(p.id) + '" disabled>Cover</button>' : '<button class="btn btn-ghost btn-sm" data-photo-cover="' + esc(p.id) + '">' + icon("star", 12) + ' Set as cover</button>') +
        '<button class="btn btn-danger btn-sm" data-photo-rm="' + esc(p.id) + '">' + icon("trash", 12) + '</button></div></div></div>';
    }).join("") + '</div>' : '<div class="card card-pad empty"><h3>No photos yet</h3><p>Upload property photos to include them in the report Addenda.</p></div>';
    return '<div class="row mt-8" style="gap:10px"><label class="btn btn-ghost btn-sm" for="ap-photos">' + icon("camera", 14) + ' Upload Photos</label><input type="file" id="ap-photos" accept="image/*" multiple hidden></div>' + grid;
  }

  function readPhotoFiles(files, done) {
    const out = [];
    let remaining = files.length;
    if (!remaining) { done(out); return; }
    [].forEach.call(files, f => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const cv = document.createElement("canvas");
          cv.width = Math.round(img.width * scale);
          cv.height = Math.round(img.height * scale);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          out.push({ dataUrl: cv.toDataURL("image/jpeg", 0.82) });
          if (!--remaining) done(out);
        };
        img.onerror = () => { out.push({ dataUrl: reader.result }); if (!--remaining) done(out); };
        img.src = reader.result;
      };
      reader.onerror = () => { if (!--remaining) done(out); };
      reader.readAsDataURL(f);
    });
  }

  function savedAppraisalsHtml(q) {
    const query = (q || "").trim().toLowerCase();
    const list = state.appraisals.slice().sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0)).filter(a => {
      if (!query) return true;
      const hay = [a.name, a.status, (a.propertyName || ""), a.purpose, a.basisOfValue].join(" ").toLowerCase();
      return hay.indexOf(query) > -1;
    });
    if (!list.length) return '<p class="dim">' + (query ? "No saved appraisals match your search." : "No saved appraisals yet — name this appraisal to autosave it.") + '</p>';
    return list.map(sv => {
      const loaded = state.appraisal && state.appraisal.id === sv.id;
      const propName = sv.propertyName || "";
      return '<div class="row spread mb-8 appr-list-row' + (loaded ? " on" : "") + '"><div class="grow"><b>' + esc(sv.name || "Untitled") + '</b><div class="dim tiny">' + esc(propName) + ' · ' + esc(sv.purpose || "") + ' · eff. ' + esc(sv.effectiveDate || "—") + '</div></div>' +
        appraisalStatusBadge(sv.status) +
        '<button class="btn btn-ghost btn-sm" data-load-appr="' + esc(sv.id) + '">' + icon("folder", 13) + ' ' + (loaded ? "Reload" : "Open") + '</button>' +
        '<button class="btn btn-danger btn-sm" data-rm-appr="' + esc(sv.id) + '">' + icon("trash", 12) + '</button></div>';
    }).join("");
  }

  function apprComps(a) {
    let html = '<div class="row spread mb-16" style="flex-wrap:wrap;gap:10px"><div><h3 style="margin:0">Comparable Sales</h3><p class="dim tiny">Minimum 3, recommended up to 6. Data source is required for auditability.</p></div><div class="row" style="gap:10px"><button class="btn btn-ghost btn-sm" id="ap-add-comp">' + icon("plus", 14) + ' Add Comparable</button><button class="btn btn-ghost btn-sm" id="ap-sample-comp">' + icon("spark", 14) + ' Load Sample Comparables</button></div></div>';
    const comps = a.comparables || [];
    if (!comps.length) html += '<div class="card card-pad empty"><h3>No comparables yet</h3><p>Add comparables or load sample data to run the Sales Comparison Approach.</p></div>';
    comps.forEach((c, i) => {
      const flagged = c.transactionType !== "Arm\u2019s-length Sale";
      html += '<div class="card card-pad mb-16 comp-card"><div class="row spread mb-8"><b>Comparable ' + (i + 1) + '</b>' +
        (c.sample ? '<span class="badge blue">sample — replace</span>' : "") +
        (flagged ? '<span class="badge gold">non-arm\u2019s-length: ' + esc(c.transactionType) + '</span>' : "") +
        '<button class="btn btn-danger btn-sm" data-rm-comp="' + esc(c.id) + '">' + icon("trash", 13) + '</button></div><div class="form-grid">';
      html += '<div class="field col-6"><label>Address</label><input class="input" data-c="address" data-id="' + esc(c.id) + '" value="' + esc(c.address) + '"></div>';
      html += '<div class="field col-3"><label>City / Province</label><input class="input" data-c="city" data-id="' + esc(c.id) + '" value="' + esc(c.city) + '"></div>';
      html += '<div class="field col-3"><label>Sale Date</label><input class="input" type="date" data-c="saleDate" data-id="' + esc(c.id) + '" value="' + esc(c.saleDate || "") + '"></div>';
      html += '<div class="field col-3"><label>Sale Price (₱)</label><input class="input input-num" inputmode="decimal" autocomplete="off" data-c="price" data-id="' + esc(c.id) + '" value="' + C.fmtNum(c.price) + '"></div>';
      html += '<div class="field col-3"><label>Lot Area (sqm)</label><input class="input input-num" inputmode="decimal" autocomplete="off" data-c="lotArea" data-id="' + esc(c.id) + '" value="' + C.fmtNum(c.lotArea) + '"></div>';
      html += '<div class="field col-3"><label>Floor Area (sqm)</label><input class="input input-num" inputmode="decimal" autocomplete="off" data-c="floorArea" data-id="' + esc(c.id) + '" value="' + C.fmtNum(c.floorArea) + '"></div>';
      html += '<div class="field col-3"><label>Property Type</label><select class="input" data-c="propertyType" data-id="' + esc(c.id) + '">' + D.PROPERTY_TYPES.map(t => '<option' + (t === c.propertyType ? " selected" : "") + '>' + esc(t) + '</option>').join("") + '</select></div>';
      html += '<div class="field col-3"><label>Transaction Type</label><select class="input" data-c="transactionType" data-id="' + esc(c.id) + '">' + TRANSACTION_TYPES.map(t => '<option' + (t === c.transactionType ? " selected" : "") + '>' + esc(t) + '</option>').join("") + '</select></div>';
      html += '<div class="field col-3"><label>Data Source (required)</label><select class="input" data-c="source" data-id="' + esc(c.id) + '">' + DATA_SOURCES.map(t => '<option' + (t === c.source ? " selected" : "") + '>' + esc(t) + '</option>').join("") + '</select></div>';
      html += '<div class="field col-3"><label>GPS Lat</label><input class="input input-num" inputmode="decimal" autocomplete="off" data-c="lat" data-id="' + esc(c.id) + '" value="' + C.fmtNum(c.lat) + '"></div>';
      html += '<div class="field col-3"><label>GPS Lng</label><input class="input input-num" inputmode="decimal" autocomplete="off" data-c="lng" data-id="' + esc(c.id) + '" value="' + C.fmtNum(c.lng) + '"></div>';
      html += '</div></div>';
    });
    return html;
  }

  function apprAdjust(a) {
    const res = appraisalRes();
    const comps = (a.comparables || []).filter(c => C.num(c.lotArea, 0) > 0);
    if (comps.length < 1) return '<div class="card card-pad empty"><h3>Add comparables first</h3><p>The adjustment grid needs at least one comparable with a lot area.</p></div>';
    let html = '<div class="row spread mb-16" style="flex-wrap:wrap;gap:10px"><div><h3 style="margin:0">Adjustment Grid</h3><p class="dim tiny">Every cell is editable; overriding an AI-suggested cell is logged to the audit trail.</p></div><div class="row" style="gap:10px"><button class="btn btn-ghost btn-sm" id="ap-ai-adj">' + icon("spark", 14) + ' AI-suggest all adjustments</button><button class="btn btn-ghost btn-sm" id="ap-clear-adj">' + icon("trash", 14) + ' Clear</button></div></div>';
    html += '<div class="card card-pad table-wrap"><table class="data adj-grid"><thead><tr><th>Element of Comparison</th>';
    comps.forEach(c => {
      const psm = c.lotArea > 0 ? C.money(C.num(c.price, 0) / C.num(c.lotArea, 1)) : "—";
      html += '<th>' + esc(c.address || c.id) + '<div class="dim tiny">' + esc(c.city || "") + ' · ' + psm + '/sqm</div></th>';
    });
    html += '</tr></thead><tbody>';
    C.APPRAISAL_ELEMENTS.forEach(el => {
      html += '<tr><td class="el-name">' + esc(el) + '</td>';
      comps.forEach(c => {
        const cell = a.adjustments.find(x => x.comparableId === c.id && x.element === el);
        const v = cell ? cell.value : 0;
        const ai = !!(cell && cell.isAiSuggested);
        html += '<td class="adj-cell"><div class="adj-input-wrap"><input class="input input-num adj-input" inputmode="decimal" autocomplete="off" data-adj="' + esc(c.id) + '" data-el="' + esc(el) + '" value="' + C.fmtNum(v) + '"><span class="pct-suffix">%</span>' + (ai ? '<span class="ai-tag" title="AI-suggested — override to log to audit trail">AI</span>' : "") + '</div></td>';
      });
      html += '</tr>';
    });
    html += '<tr class="totals"><td class="el-name"><b>Net Adjustment</b></td>';
    comps.forEach(c => {
      const cells = a.adjustments.filter(x => x.comparableId === c.id);
      const total = cells.reduce((s, x) => s + C.num(x.value, 0), 0);
      const adjPsm = C.num(c.lotArea, 1) > 0 ? C.num(c.price, 0) * (1 + total / 100) / C.num(c.lotArea, 1) : 0;
      html += '<td><b>' + C.pct(total / 100) + '</b><div class="dim tiny">' + C.money(adjPsm) + '/sqm adj.</div></td>';
    });
    html += '</tr></tbody></table></div>';
    if (res) {
      html += '<div class="card card-pad mt-16"><div class="row spread"><div><h3>Sales Comparison — computed value</h3><p class="dim tiny">Weighted by 1/(1+net adjustment %); subject area ' + C.numFmt(res.subjectArea) + ' sqm. Save it as a labeled Final Value in the Approaches tab.</p></div><div class="k-value" style="font-size:22px">' + C.money(res.sales.indicated) + '</div></div>' +
        '<p class="dim tiny mt-8">Best comparable: ' + (res.sales.bestComp ? esc(res.sales.bestComp.address || res.sales.bestComp.id) + " (" + C.money(res.sales.bestComp.adjPsm) + "/sqm, " + C.pct(res.sales.bestComp.totalPct / 100) + " net adj.)" : "—") + '</p></div>';
    }
    return html;
  }

  function costOutHtml(res) {
    return '<div class="row spread"><span>Land value (' + C.money(res.cost.landValuePerSqm) + '/sqm × ' + C.numFmt(res.subjectArea) + ')</span><b>' + C.money(res.cost.landValue) + '</b></div>' +
      '<div class="row spread"><span>Replacement cost new (' + C.money(res.cost.rcnPerSqm) + '/sqm × ' + C.numFmt(res.cost.bldgArea) + ')</span><b>' + C.money(res.cost.rcn) + '</b></div>' +
      '<div class="row spread"><span>Total depreciation (' + C.pct((res.cost.depP + res.cost.depF + res.cost.depE) / 100) + ')</span><b>−' + C.money(res.cost.depAmt) + '</b></div>' +
      '<div class="row spread"><span>Computed value</span><b class="accent">' + C.money(res.cost.indicated) + '</b></div>';
  }
  function incomeOutHtml(res, a) {
    if (!res.income) return '<p class="dim">Enter a cap rate to compute the value.</p>';
    return '<div class="row spread"><span>Gross potential income</span><b>' + C.money(res.income.gpi) + '</b></div>' +
      '<div class="row spread"><span>Effective gross income (−' + C.pct(res.income.vacancyPct / 100) + ')</span><b>' + C.money(res.income.egi) + '</b></div>' +
      '<div class="row spread"><span>Net operating income</span><b>' + C.money(res.income.noi) + '</b></div>' +
      '<div class="row spread"><span>Computed value (NOI ÷ ' + C.pct(res.income.capRate / 100) + ')</span><b class="accent">' + (res.income.indicated != null ? C.money(res.income.indicated) : "enter cap rate") + '</b></div>';
  }

  function apprFVBlock(a, key, liveValue) {
    const title = "Final Value — " + APPROACH_TITLES[key];
    const rec = (a.approachResults || {})[key] || {};
    const val = rec.finalValue;
    const at = rec.at;
    return '<div class="card appr-fv mt-12">' +
      '<div class="row spread mb-8"><div><b>' + icon("target", 13) + ' ' + esc(title) + '</b><div class="dim tiny">Live computed: ' + (liveValue != null ? C.money(liveValue) : "—") + '</div></div>' +
      '<button class="btn btn-ghost btn-sm" id="ap-fv-' + key + '-btn">' + icon("refresh", 13) + ' Recalculate</button></div>' +
      '<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><input class="input input-num fv-input" inputmode="decimal" autocomplete="off" id="ap-fv-' + key + '-input" value="' + (val != null ? C.fmtNum(val) : "") + '" placeholder="Final Value (₱)">' +
      '<span class="dim tiny" id="ap-fv-' + key + '-at">' + (at ? 'Saved ' + new Date(at).toLocaleString() : 'Not yet saved') + '</span></div>' +
      '<p class="dim tiny mt-8">Recalculate snapshots the current computed value into this labeled, saved Final Value. You can also edit it directly — every change is timestamped and the approaches, charts, reconciliation, and report all read from these saved Final Values.</p>' +
      '</div>';
  }

  function apprApproaches(a) {
    const res = appraisalRes();
    const c = a.cost, inc = a.income;
    const bldgType = (appraisalSubjectRaw(a).building || {}).constructionType || "CHB / Masonry";
    let html = '<div class="grid grid-2">';
    html += '<div class="card card-pad"><h3 class="mb-8">' + icon("scale", 15) + ' Sales Comparison</h3>';
    if (res && res.sales.adjusted.length) {
      html += '<div class="table-wrap"><table class="data"><tr><th>Comparable</th><th class="num">Price</th><th class="num">/sqm</th><th class="num">Net Adj</th><th class="num">Adj /sqm</th></tr>';
      res.sales.adjusted.forEach(x => {
        html += '<tr><td>' + esc(x.address || x.id) + '</td><td class="num">' + C.money(x.price) + '</td><td class="num">' + C.money(x.rawPsm) + '</td><td class="num">' + C.pct(x.totalPct / 100) + '</td><td class="num">' + C.money(x.adjPsm) + '</td></tr>';
      });
      html += '</table></div>';
      html += '<div class="row spread mt-12"><span>Weighted avg. per sqm</span><b>' + C.money(res.sales.wAvgPsm) + '</b></div>';
      html += '<div class="row spread"><span>Subject lot area</span><b>' + C.numFmt(res.subjectArea) + ' sqm</b></div>';
      html += '<div class="row spread"><span>Computed value</span><b class="accent">' + C.money(res.sales.indicated) + '</b></div>';
      html += apprFVBlock(a, "sales", res.sales.indicated);
    } else {
      html += '<p class="dim">Add comparables with lot area to run the Sales Comparison Approach.</p>';
    }
    html += '</div>';
    html += '<div class="card card-pad"><h3 class="mb-8">' + icon("layers", 15) + ' Cost Approach</h3><div class="form-grid">';
    html += '<div class="field col-6"><label>Land Value (₱/sqm)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="apc-land" value="' + C.fmtNum(c.landValuePerSqm) + '"></div>';
    html += '<div class="field col-6"><label>Replacement Cost New (₱/sqm)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="apc-rcn" value="' + C.fmtNum(c.rcnPerSqm) + '"><div class="field-hint">Default: ' + C.money(D.CONSTRUCTION_COST[bldgType] || 15000) + '/sqm (' + esc(bldgType) + ')</div></div>';
    html += '<div class="field col-6"><label>Building Area (sqm)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="apc-bldg" value="' + C.fmtNum(c.bldgArea) + '"></div>';
    html += '<div class="field col-3"><label>Phys. Dep. (%)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="apc-depP" value="' + C.fmtNum(c.depPhysical) + '"></div>';
    html += '<div class="field col-3"><label>Func. Dep. (%)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="apc-depF" value="' + C.fmtNum(c.depFunctional) + '"></div>';
    html += '<div class="field col-3"><label>Econ. Dep. (%)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="apc-depE" value="' + C.fmtNum(c.depEconomic) + '"></div>';
    html += '<div class="field col-12"><label>Depreciation Note</label><input class="input" id="apc-depNote" value="' + esc(c.depNote || "") + '"></div>';
    html += '</div>';
    if (res) {
      html += '<div class="mt-12" id="apc-out">' + costOutHtml(res) + '</div>' + apprFVBlock(a, "cost", res.cost.indicated);
    }
    html += '</div>';
    html += '<div class="card card-pad"><h3 class="mb-8">' + icon("trending", 15) + ' Income Capitalization Approach</h3>';
    html += '<label class="switch"><input type="checkbox" id="api-use"' + (inc.useIncome ? " checked" : "") + '> Income-producing property (show Income Approach)</label>';
    if (inc.useIncome) {
      html += '<div class="form-grid mt-12"><div class="field col-6"><label>Gross Potential Income (₱/yr)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="api-gpi" value="' + C.fmtNum(inc.gpi) + '"></div>';
      html += '<div class="field col-3"><label>Vacancy Loss (%)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="api-vac" value="' + C.fmtNum(inc.vacancyPct) + '"></div>';
      html += '<div class="field col-3"><label>Operating Exp. (%)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="api-opex" value="' + C.fmtNum(inc.opexPct) + '"></div>';
      html += '<div class="field col-6"><label>Capitalization Rate (%)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="api-cap" value="' + C.fmtNum(inc.capRate) + '"></div>';
      html += '<div class="field col-12"><label>Cap Rate Derivation Note (required)</label><input class="input" id="api-capNote" placeholder="e.g. extracted from comparable sales, band-of-investment, or market surveys" value="' + esc(inc.capRateNote || "") + '"></div>';
      html += '</div>';
      if (res && res.income) {
        html += '<div class="mt-12" id="api-out">' + incomeOutHtml(res, a) + '</div>' + apprFVBlock(a, "income", res.income.indicated);
      }
    } else {
      html += '<p class="dim mt-12">Hidden for owner-occupied / non-income-producing property. Enable the switch to include the Income Capitalization Approach.</p>';
    }
    html += '</div>';
    html += '</div>';
    return html;
  }

  function apprReconcile(a) {
    const res = appraisalRes();
    const rec = C.recommend(appraisalSubjectRaw(a));
    let html = '<div class="card card-pad"><h3 class="mb-16">' + icon("scale", 15) + ' Reconciliation & Final Value Opinion</h3>';
    html += '<div class="table-wrap"><table class="data"><tr><th>Approach</th><th class="num">Saved Final Value</th><th>Saved</th><th>Notes</th></tr>';
    html += '<tr><td>Sales Comparison</td><td class="num">' + (res ? (apprFV(a, "sales") != null ? C.money(apprFV(a, "sales")) : C.money(res.sales.indicated) + ' <span class="dim tiny">(live)</span>') : "—") + '</td><td class="dim tiny">' + (apprFVAt(a, "sales") ? new Date(apprFVAt(a, "sales")).toLocaleDateString() : "not saved") + '</td><td class="dim">Weighted average of adjusted comparables — save in Approaches tab</td></tr>';
    html += '<tr><td>Cost Approach</td><td class="num">' + (res ? (apprFV(a, "cost") != null ? C.money(apprFV(a, "cost")) : C.money(res.cost.indicated) + ' <span class="dim tiny">(live)</span>') : "—") + '</td><td class="dim tiny">' + (apprFVAt(a, "cost") ? new Date(apprFVAt(a, "cost")).toLocaleDateString() : "not saved") + '</td><td class="dim">Land + Replacement Cost New − Depreciation — save in Approaches tab</td></tr>';
    html += '<tr><td>Income Capitalization</td><td class="num">' + (res && res.income && res.income.indicated != null ? (apprFV(a, "income") != null ? C.money(apprFV(a, "income")) : C.money(res.income.indicated) + ' <span class="dim tiny">(live)</span>') : "n/a") + '</td><td class="dim tiny">' + (apprFVAt(a, "income") ? new Date(apprFVAt(a, "income")).toLocaleDateString() : (res && res.income ? "not saved" : "n/a")) + '</td><td class="dim">' + (a.income.useIncome ? "NOI ÷ cap rate — save in Approaches tab" : "Not applied (not income-producing)") + '</td></tr>';
    html += '</table><p class="dim tiny mt-8">Each approach\u2019s labeled Final Value is saved independently on the Approaches tab — distinct from the overall Final Value Opinion below, which is concluded through reconciliation.</p></div>';
    if (a.finalConfirmed && a.finalValue != null) {
      html += '<div class="final-confirmed mt-16"><div class="row spread"><span>Final Value Opinion (confirmed)</span><b style="font-size:20px">' + C.money(a.finalValue) + '</b></div><p class="dim tiny">Confirmed by ' + esc(a.confirmedBy) + ' on ' + new Date(a.confirmedAt).toLocaleString() + '. Value opinion is manually confirmed — never auto-populated.</p></div>';
    }
    html += '<div class="form-grid mt-16"><div class="field col-4"><label>Final Value Opinion — single (₱)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="ap-final" value="' + C.fmtNum(a.finalValue) + '"></div>';
    html += '<div class="field col-4"><label>Or range — low (₱)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="ap-final-min" value="' + C.fmtNum(a.finalMin) + '"></div>';
    html += '<div class="field col-4"><label>Range — high (₱)</label><input class="input input-num" inputmode="decimal" autocomplete="off" id="ap-final-max" value="' + C.fmtNum(a.finalMax) + '"></div></div>';
    html += '<div class="row mt-16" style="gap:10px">' +
      (a.finalConfirmed
        ? '<button class="btn btn-ghost btn-sm" id="ap-unconfirm">' + icon("edit", 14) + ' Revise (unlock)</button>'
        : '<button class="btn btn-primary btn-sm" id="ap-confirm">' + icon("check", 14) + ' Confirm Final Value Opinion</button>') +
      '</div>';
    if (!a.finalConfirmed) html += '<p class="dim tiny mt-8">The final value opinion is manually confirmed by the appraiser — it is never silently populated from the calculations.</p>';
    html += '</div>';
    html += '<div class="card card-pad mt-16"><h3 class="mb-8">Reconciliation Notes</h3><textarea class="input" id="ap-recnote" rows="3">' + esc(a.reconciliationNotes || "") + '</textarea><div class="row mt-8" style="gap:10px"><button class="btn btn-ghost btn-sm" id="ap-ai-rec">' + icon("spark", 14) + ' Draft with AI (advisory)</button></div></div>';
    if (a.finalConfirmed && a.finalValue != null) {
      const expected = C.num(rec.maxPrice, 0);
      const diff = expected > 0 ? Math.abs(a.finalValue - expected) / expected : 0;
      if (diff > 0.1) {
        html += '<div class="notice-banner warn mt-16">' + icon("shield", 14) + ' <span>Discrepancy surfaced: the confirmed final value opinion (' + C.money(a.finalValue) + ') differs from the Phase 3 investment maximum price (' + C.money(expected) + ') by ' + C.pct(diff) + '. These serve different purposes (formal valuation vs. investment analysis) — the appraiser should document the basis for the difference in the report.</span></div>';
      } else {
        html += '<div class="notice-banner mt-16">' + icon("check", 14) + ' <span>Final value opinion is within ' + C.pct(diff) + ' of the Phase 3 investment max price (' + C.money(expected) + ').</span></div>';
      }
    }
    return html;
  }

  function apprCharts(a) {
    const res = appraisalRes();
    if (!res || !res.sales.adjusted.length) return '<div class="card card-pad empty"><h3>No chart data yet</h3><p>Add comparables and run adjustments to generate charts.</p></div>';
    let html = '<div class="grid grid-2">';
    html += '<div class="card card-pad"><h3 class="mb-8">Comparable Price per Sqm</h3>' + chartCompPsm(res, appraisalSubjectRaw(a)) + '</div>';
    html += '<div class="card card-pad"><h3 class="mb-8">Adjustment Waterfall' + (res.sales.bestComp ? ' — ' + esc(res.sales.bestComp.address || res.sales.bestComp.id) : "") + '</h3>' + chartWaterfall(res.sales.bestComp) + '</div>';
    html += '<div class="card card-pad"><h3 class="mb-8">Three-Approach Comparison</h3>' + chartThree(res, a) + '</div>';
    html += '<div class="card card-pad"><h3 class="mb-8">Market Trend (Price/sqm vs Date)</h3>' + chartTrend(res) + '</div>';
    html += '<div class="card card-pad"><h3 class="mb-8">Depreciation Breakdown (Cost Approach)</h3>' + chartDep(res) + '</div>';
    html += '</div>';
    return html;
  }

  function apprReport(a) {
    const res = appraisalRes();
    let html = '<div class="card card-pad"><h3 class="mb-16">' + icon("file", 15) + ' Report Generation & Certification</h3>' +
      '<div class="notice-banner">' + icon("shield", 14) + ' <span>' + APPRAISAL_NOTICE + '</span></div>';
    html += '<div class="form-grid mt-16"><div class="field col-3"><label>Appraiser Name</label><input class="input" id="apc-name" value="' + esc(a.cert.appraiserName || "") + '" placeholder="PRC-licensed appraiser"></div>';
    html += '<div class="field col-3"><label>PRC License No.</label><input class="input" id="apc-prc" value="' + esc(a.cert.prcNo || "") + '"></div>';
    html += '<div class="field col-3"><label>PTR No.</label><input class="input" id="apc-ptr" value="' + esc(a.cert.ptrNo || "") + '"></div>';
    html += '<div class="field col-3"><label>Sign-off Date</label><input class="input" type="date" id="apc-date" value="' + esc(a.cert.date || "") + '"></div></div>';
    html += '<p class="dim tiny mt-8">These fields are left blank for manual sign-off — never auto-filled. Certification requires the appraisal name, a confirmed final value opinion, and the certification fields above.</p>';
    html += '<div class="row mt-16" style="gap:10px;flex-wrap:wrap">' +
      '<button class="btn btn-primary btn-sm" id="ap-preview">' + icon("print", 14) + ' Print PDF</button>' +
      '<button class="btn btn-ghost btn-sm" id="ap-xls-grid">' + icon("download", 14) + ' Export Adjustment Grid (Excel)</button>' +
      '<button class="btn btn-ghost btn-sm" id="ap-xls-calc">' + icon("download", 14) + ' Export Calculations (Excel)</button>' +
      '<button class="btn btn-ghost btn-sm" id="ap-status-review">' + icon("edit", 14) + ' Mark Under Review</button>' +
      '<button class="btn btn-ghost btn-sm" id="ap-status-cert">' + icon("check", 14) + ' Mark Certified</button></div>';
    html += '<div id="ap-cert-msg" class="mt-12"></div>';
    html += '</div>';
    html += '<div class="card card-pad mt-16"><h3 class="mb-8">Audit Trail</h3>';
    html += (a.auditLog.length ? '<div class="table-wrap"><table class="data"><tr><th>When</th><th>User</th><th>Event</th></tr>' + a.auditLog.slice().reverse().slice(0, 20).map(l => '<tr><td>' + new Date(l.ts).toLocaleString() + '</td><td>' + esc(l.user) + '</td><td>' + esc(l.msg) + '</td></tr>').join("") + '</table></div>' : '<p class="dim">No audit events yet.</p>');
    html += '</div>';
    html += '<div class="card card-pad mt-16"><h3 class="mb-16">' + icon("folder", 15) + ' Saved Appraisals <span class="badge blue">' + state.appraisals.length + '</span></h3>' +
      '<p class="dim tiny">Open or delete previously saved appraisals — the working copy reloads where you left off.</p>' +
      '<div class="field"><input class="input" id="ap-search" placeholder="Search by name, property, or status…"></div>' +
      '<div class="mt-12" id="ap-list">' + savedAppraisalsHtml("") + '</div>' +
      '</div>';
    return html;
  }

  /* ---------- SVG charts ---------- */
  const SVG_NS = "http://www.w3.org/2000/svg";
  function chartWrap(svg) { return '<div class="chart-box"><svg viewBox="0 0 460 240" xmlns="' + SVG_NS + '" style="width:100%;height:auto;font-family:var(--font-sans);font-size:10px">' + svg + '</svg></div>'; }
  function chartBars(items, max, color, fmt) {
    const w = 460, h = 240, padL = 54, padB = 30, padT = 14;
    const plotW = w - padL - 12, plotH = h - padT - padB;
    let svg = '';
    for (let g = 0; g <= 4; g++) { const y = padT + plotH - (plotH * g / 4); svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (w - 12) + '" y2="' + y + '" stroke="#E3E8EF" stroke-width="1"/>'; svg += '<text x="' + (padL - 5) + '" y="' + (y + 3) + '" text-anchor="end" fill="#98A5B8">' + fmt(max * g / 4) + '</text>'; }
    const bw = Math.max(6, Math.min(36, plotW / (items.length || 1) * 0.5));
    const step = plotW / (items.length || 1);
    items.forEach((it, i) => {
      const x = padL + i * step + (step - bw) / 2;
      const bh = plotH * (it.value / (max || 1));
      const y = padT + plotH - bh;
      svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw + '" height="' + bh.toFixed(1) + '" fill="' + (it.color || color || "#F97316") + '" rx="2"><title>' + (it.label || "") + ': ' + fmt(it.value) + '</title></rect>';
      svg += '<text x="' + (x + bw / 2) + '" y="' + (h - 10) + '" text-anchor="middle" fill="#16202E" transform="rotate(-18 ' + (x + bw / 2) + ' ' + (h - 10) + ')">' + esc(it.short || it.label || "") + '</text>';
    });
    return chartWrap(svg);
  }
  function chartCompPsm(res, raw) {
    const items = [{ short: "Subject", label: "Subject", value: C.num(raw.property.marketValuePerSqm, res.sales.wAvgPsm), color: "#EA580C" }];
    res.sales.adjusted.forEach((x, i) => {
      items.push({ short: "C" + (i + 1), label: x.address + " unadjusted", value: x.rawPsm, color: "#94A3B8" });
      items.push({ short: "C" + (i + 1) + "A", label: x.address + " adjusted", value: x.adjPsm, color: "#F97316" });
    });
    const max = Math.max.apply(null, items.map(i => i.value)) * 1.15;
    return chartBars(items, max, "#F97316", v => C.money(v));
  }
  function chartWaterfall(best) {
    if (!best) return '<p class="dim">No comparable to chart.</p>';
    const steps = [];
    steps.push({ label: "Raw price", value: best.rawPsm, color: "#94A3B8" });
    best.cells.forEach(cl => { if (cl.value !== 0) steps.push({ label: cl.element.split(" ")[0] + (cl.element.split(" ")[1] ? " " + cl.element.split(" ")[1] : ""), value: cl.value, color: cl.value > 0 ? "#F97316" : "#EF4444", delta: true }); });
    steps.push({ label: "Adjusted", value: best.adjPsm, color: "#EA580C" });
    const w = 460, h = 240, padL = 54, padB = 34, padT = 14;
    const plotW = w - padL - 12, plotH = h - padT - padB;
    const all = steps.filter(s => !s.delta).map(s => s.value);
    const max = Math.max.apply(null, all) * 1.15, min = Math.min.apply(null, all) * 0.9;
    const scale = v => padT + plotH - (v - min) / (max - min) * plotH;
    let svg = '';
    for (let g = 0; g <= 4; g++) { const y = padT + plotH * g / 4; svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (w - 12) + '" y2="' + y + '" stroke="#E3E8EF" stroke-width="1"/>'; }
    const bw = Math.max(8, plotW / steps.length * 0.55);
    const step = plotW / steps.length;
    let cursor = best.rawPsm;
    steps.forEach((s, i) => {
      const x = padL + i * step + (step - bw) / 2;
      let y1, y2;
      if (s.delta) { const nv = cursor + s.value; y1 = scale(Math.max(cursor, nv)); y2 = scale(Math.min(cursor, nv)); cursor = nv; }
      else { y1 = scale(s.value); y2 = scale(0); cursor = s.value; }
      svg += '<rect x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, (y2 - y1)).toFixed(1) + '" fill="' + s.color + '" rx="2"><title>' + esc(s.label) + ': ' + (s.delta ? (s.value > 0 ? "+" : "") + s.value + "%" : C.money(s.value)) + '</title></rect>';
      svg += '<text x="' + (x + bw / 2) + '" y="' + (h - 8) + '" text-anchor="middle" transform="rotate(-30 ' + (x + bw / 2) + ' ' + (h - 8) + ')">' + esc(s.label) + '</text>';
    });
    return chartWrap(svg);
  }
  function chartThree(res, a) {
    const fv = (key, fallback) => apprFV(a, key) != null ? apprFV(a, key) : fallback;
    const items = [];
    items.push({ short: "FV Sales", label: "Final Value — Sales Comparison Approach", value: fv("sales", res.sales.indicated), color: "#F97316" });
    items.push({ short: "FV Cost", label: "Final Value — Cost Approach", value: fv("cost", res.cost.indicated), color: "#6366F1" });
    if (res.income && res.income.indicated != null) items.push({ short: "FV Income", label: "Final Value — Income Capitalization Approach", value: fv("income", res.income.indicated), color: "#F59E0B" });
    if (a.finalConfirmed && a.finalValue != null) items.push({ short: "Opinion", label: "Final Value Opinion", value: a.finalValue, color: "#EA580C" });
    const max = Math.max.apply(null, items.map(i => i.value)) * 1.15;
    return chartBars(items, max, "#F97316", v => C.money(v));
  }
  function chartTrend(res) {
    const pts = res.sales.adjusted.map(x => ({ d: x.saleDate ? new Date(x.saleDate).getTime() : Date.now(), psm: x.rawPsm }));
    const subj = { d: Date.now(), psm: res.sales.wAvgPsm };
    const all = pts.concat([subj]);
    const minT = Math.min.apply(null, all.map(p => p.d)), maxT = Math.max.apply(null, all.map(p => p.d));
    const maxP = Math.max.apply(null, all.map(p => p.psm)) * 1.15;
    const w = 460, h = 240, padL = 54, padB = 30, padT = 14;
    const plotW = w - padL - 12, plotH = h - padT - padB;
    const X = t => padL + (t - minT) / ((maxT - minT) || 1) * plotW;
    const Y = psm => padT + plotH - (psm / maxP) * plotH;
    let svg = '';
    for (let g = 0; g <= 4; g++) { const y = padT + plotH - plotH * g / 4; svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (w - 12) + '" y2="' + y + '" stroke="#E3E8EF" stroke-width="1"/><text x="' + (padL - 5) + '" y="' + (y + 3) + '" text-anchor="end" fill="#98A5B8">' + C.money(maxP * g / 4) + '</text>'; }
    const line = pts.map((p, i) => (i ? "L" : "M") + X(p.d).toFixed(1) + " " + Y(p.psm).toFixed(1)).join(" ");
    svg += '<path d="' + line + '" fill="none" stroke="#F97316" stroke-width="2"/>';
    pts.forEach(p => { svg += '<circle cx="' + X(p.d).toFixed(1) + '" cy="' + Y(p.psm).toFixed(1) + '" r="4" fill="#F97316"><title>' + C.money(p.psm) + '/sqm</title></circle>'; });
    svg += '<line x1="' + X(subj.d).toFixed(1) + '" y1="' + Y(subj.psm).toFixed(1) + '" x2="' + (w - 12) + '" y2="' + Y(subj.psm).toFixed(1) + '" stroke="#EA580C" stroke-width="2" stroke-dasharray="4 3"/>';
    svg += '<text x="' + (w - 12) + '" y="' + (Y(subj.psm) - 4) + '" text-anchor="end" fill="#EA580C">subject weighted ' + C.money(subj.psm) + '</text>';
    return chartWrap(svg);
  }
  function chartDep(res) {
    const c = res.cost;
    const total = c.rcn || 1;
    const segs = [
      { label: "Physical " + C.pct(c.depP / 100), v: c.depAmt * (c.depP || 0) / Math.max(1, c.depP + c.depF + c.depE), color: "#EF4444" },
      { label: "Functional " + C.pct(c.depF / 100), v: c.depAmt * (c.depF || 0) / Math.max(1, c.depP + c.depF + c.depE), color: "#F59E0B" },
      { label: "Economic " + C.pct(c.depE / 100), v: c.depAmt * (c.depE || 0) / Math.max(1, c.depP + c.depF + c.depE), color: "#94A3B8" }
    ];
    const w = 460, h = 240;
    const bw = 90, x0 = 70, y0 = 70;
    let svg = '<text x="20" y="40" fill="#16202E" font-size="11">Replacement cost new: ' + C.money(c.rcn) + '</text><text x="20" y="56" fill="#16202E" font-size="11">Total depreciation: ' + C.money(c.depAmt) + ' (' + C.pct((c.depP + c.depF + c.depE) / 100) + ')</text>';
    const plotW = w - x0 - 40;
    segs.forEach((s, i) => {
      const sw = c.rcn > 0 ? (s.v / c.rcn) * plotW : 0;
      const swc = sw > 0 ? sw.toFixed(1) : "0";
      svg += '<rect x="' + x0 + '" y="' + (y0 + i * 44) + '" width="' + swc + '" height="26" fill="' + s.color + '" rx="3"><title>' + esc(s.label) + ': ' + C.money(s.v) + '</title></rect>';
      svg += '<text x="' + (x0 + sw + 6) + '" y="' + (y0 + i * 44 + 18) + '" fill="#16202E">' + C.money(s.v) + '</text>';
      svg += '<text x="20" y="' + (y0 + i * 44 + 18) + '" fill="#98A5B8" text-anchor="start">' + esc(s.label.split(" ")[0]) + '</text>';
    });
    return chartWrap(svg);
  }

  /* ---------- PVS report ---------- */
  function appraisalReportHTML() {
    const a = activeAppraisal();
    const raw = appraisalSubjectRaw(a);
    let res = null;
    try { res = C.appraisalCompute(a, raw); } catch (e) { res = null; }
    const rec = C.recommend(raw);
    const prop = apprProperty(a);
    const locTxt = (prop.address ? [prop.address, prop.province].filter(Boolean).join(", ") : [prop.barangay, prop.city, prop.province].filter(Boolean).join(", ")) || "—";
    const meta = [
      ["Client / Subject", prop.name || "Untitled Property"], ["Appraisal", a.name && a.name.trim() ? a.name : "(not named)"], ["Property Location", locTxt],
      ["Purpose of Valuation", a.purpose], ["Basis of Value", a.basisOfValue],
      ["Effective Date of Valuation", a.effectiveDate], ["Report Issue Date", new Date().toLocaleDateString()],
      ["Status", a.status]
    ];
    const r = s => "<tr><td><b>" + s[0] + "</b></td><td>" + s[1] + "</td></tr>";
    const sections = [];

    sections.push({ title: "1. Executive Summary", html: "<table>" + meta.map(r).join("") + "</table>" +
      "<p style='margin-top:10px'><b>Final Value Opinion:</b> " + (a.finalConfirmed && a.finalValue != null ? C.money(a.finalValue) : "PENDING APPRAISER CONFIRMATION") +
      (a.finalMin != null && a.finalMax != null ? " (range " + C.money(a.finalMin) + " – " + C.money(a.finalMax) + ")" : "") + "</p>" +
      "<p style='font-size:10px;color:#98A5B8'>" + APPRAISAL_NOTICE + "</p>" });

    sections.push({ title: "2. Scope of Work & Extraordinary Assumptions", html: "<p><b>Extraordinary Assumptions / Hypothetical Conditions:</b> " + esc(a.extraordinaryAssumptions || "None") + "</p><p><b>Scope of Work:</b> " + esc(a.scopeOfWork || "Not specified.") + "</p>" });

    sections.push({ title: "3. Subject Property Description", html:
      "<h3>Location</h3><table>" +
      r(["Address", prop.address || "—"]) + r(["Region", prop.region || "—"]) + r(["Province", prop.province || "—"]) +
      r(["City / Municipality", prop.city || "—"]) + r(["Barangay", prop.barangay || "—"]) +
      r(["Coordinates (lat, lng)", (prop.lat && prop.lng) ? (prop.lat + ", " + prop.lng) : "—"]) + "</table>" +
      "<h3>Physical Characteristics</h3><table>" +
      r(["Property Type", prop.propertyType || "—"]) + r(["Lot Area", C.numFmt(prop.lotArea) + " sqm"]) + r(["Frontage", prop.frontage ? prop.frontage + " m" : "—"]) +
      r(["Depth", prop.depth ? prop.depth + " m" : "—"]) +
      r(["Zoning", prop.zoning || "—"]) + r(["Land Use", prop.landUse || "—"]) + r(["Road", prop.roadType + (prop.roadWidth ? " (" + prop.roadWidth + " m)" : "")]) +
      r(["Flood Risk", prop.floodRisk || "—"]) + r(["Growth Rate", C.pct(prop.growthRate || 0)]) + "</table>" +
      ((prop.titleKind || prop.titleNo || prop.lotNo || prop.surveyNo || prop.registryDeeds) ?
        "<h3>Land Title &amp; Technical Description</h3><table>" +
        r(["Title Type", prop.titleKind || "—"]) + r(["Title Number", prop.titleNo || "—"]) +
        r(["Lot No.", prop.lotNo || "—"]) + r(["Survey No.", prop.surveyNo || "—"]) +
        r(["Registry of Deeds", prop.registryDeeds || "—"]) +
        r(["Plotted Land Area", prop.plotArea ? C.fmtNum(Math.round(prop.plotArea)) + " sqm" : "—"]) + "</table>" : "") });

    sections.push({ title: "4. Market Analysis Narrative", html: "<p>" + C.appraisalNarrative(raw) + "</p>" });

    sections.push({ title: "5. Highest & Best Use", html: "<p><b>" + rec.hbu.recommendation.label + "</b></p><ul>" + rec.hbu.recommendation.reasons.map(x => "<li>" + x + "</li>").join("") + "</ul>" });

    const comps = res ? res.sales.adjusted : [];
    const grid = comps.length
      ? "<table><tr><th>Element</th>" + comps.map((x, i) => "<th>Comp " + (i + 1) + "</th>").join("") + "</tr>" +
        C.APPRAISAL_ELEMENTS.map(el => "<tr><td>" + el + "</td>" + comps.map(x => { const cell = x.cells.find(cc => cc.element === el); const v = cell ? cell.value : 0; return "<td>" + (v > 0 ? "+" : "") + v + "%</td>"; }).join("") + "</tr>").join("") +
        "<tr><td><b>Net Adjustment</b></td>" + comps.map(x => "<td><b>" + (x.totalPct > 0 ? "+" : "") + x.totalPct.toFixed(1) + "%</b></td>").join("") + "</tr>" +
        "<tr><td><b>Adjusted Price/sqm</b></td>" + comps.map(x => "<td>" + C.money(x.adjPsm) + "</td>").join("") + "</tr></table>"
      : "<p><i>No comparables with a lot area entered yet — add them on the Comparables tab to complete the Sales Comparison Approach.</i></p>";
    const wAvgLine = comps.length
      ? "<p>Weighted average computed value: <b>" + C.money(res.sales.indicated) + "</b> (₱" + C.numFmt(res.sales.wAvgPsm) + "/sqm × " + C.numFmt(res.subjectArea) + " sqm).</p>"
      : "";

    sections.push({ title: "6. Valuation Approaches", html: "<h3>Sales Comparison Approach</h3>" + grid + wAvgLine +
      "<p><b>Final Value — Sales Comparison Approach:</b> " + (comps.length ? apprFVLabel(a, "sales", res.sales.indicated) : "—") + "</p>" +
      (res ? chartCompPsm(res, raw) : "") +
      "<h3>Cost Approach</h3>" + (res ? "<table>" + r(["Land Value", C.money(res.cost.landValue) + " (" + C.money(res.cost.landValuePerSqm) + "/sqm)"]) +
      r(["Replacement Cost New", C.money(res.cost.rcn)]) + r(["Less: Total Depreciation", "−" + C.money(res.cost.depAmt) + " (" + C.pct((res.cost.depP + res.cost.depF + res.cost.depE) / 100) + ")"]) +
      r(["Computed Value — Cost", C.money(res.cost.indicated)]) + r(["Final Value — Cost Approach", apprFVLabel(a, "cost", res.cost.indicated)]) + "</table>" + chartDep(res) : "<p>Cost approach could not be computed.</p>") +
      "<h3>Income Capitalization Approach</h3>" + (res && res.income ? "<table>" + r(["Gross Potential Income", C.money(res.income.gpi)]) + r(["Effective Gross Income", C.money(res.income.egi)]) + r(["Net Operating Income", C.money(res.income.noi)]) + r(["Capitalization Rate", C.pct(res.income.capRate / 100) + " (" + esc((a.income && a.income.capRateNote) || "note not provided") + ")"]) + r(["Computed Value — Income", res.income.indicated != null ? C.money(res.income.indicated) : "—"]) + r(["Final Value — Income Capitalization Approach", apprFVLabel(a, "income", res.income.indicated)]) + "</table>" : "<p>Not applied — property not flagged as income-producing.</p>") });

    sections.push({ title: "7. Reconciliation & Final Value Opinion", html: "<table>" + r(["Sales Comparison", apprFVLabel(a, "sales", res ? res.sales.indicated : null)]) + r(["Cost Approach", apprFVLabel(a, "cost", res ? res.cost.indicated : null)]) + r(["Income Capitalization", res && res.income && res.income.indicated != null ? apprFVLabel(a, "income", res.income.indicated) : "n/a"]) + "</table>" +
      "<div class='fv-opinion'><div class='fv-opinion-label'>Final Value Opinion</div><div class='fv-opinion-value'>" + (a.finalConfirmed && a.finalValue != null ? C.money(a.finalValue) : "Pending Appraiser Confirmation") + "</div><div class='fv-opinion-sub'>Effective date of valuation: " + esc(a.effectiveDate || "\u2014") + " \u00b7 " + esc(a.purpose || "") + "</div></div>" +
      "<p style='font-size:10px;color:#98A5B8'>Each approach above carries its own labeled, saved Final Value concluded on the Approaches tab; the Final Value Opinion is the appraiser's reconciliation of those three outputs.</p>" +
      "<p><b>Reconciliation Notes:</b> " + esc(a.reconciliationNotes || "Not provided — appraiser to complete.") + "</p>" +
      "<p style='font-size:10px;color:#98A5B8'>AI-drafted reconciliation is advisory only and is not a substitute for the appraiser's professional judgment.</p>" });

    sections.push({ title: "8. Assumptions & Limiting Conditions", html: "<ul><li>This report is a computer-assisted draft valuation prepared for professional review.</li><li>It is not a certified appraisal until reviewed and signed by a PRC-licensed Real Estate Appraiser under RA 9646.</li><li>Extraordinary assumptions: " + esc(a.extraordinaryAssumptions || "None") + "</li><li>Information relied upon is assumed accurate but not warranted; appraiser to verify.</li><li>Market data reflects the effective date of valuation.</li></ul>" });

    sections.push({ title: "9. Certification", html: "I certify that, to the best of my knowledge and belief: the statements of fact are true and correct; the reported analyses, opinions, and conclusions are limited only by the reported assumptions and limiting conditions; and I have no present or prospective interest in the subject property, except as disclosed. I am competent to prepare this appraisal and hold the professional credentials below." +
      "<div class='sig-block' style='margin-top:18px'><div style='width:45%'><div style='height:54px'></div><div style='border-top:1px solid #16202E;padding-top:4px'>Signature (manual / e-signature)</div></div><div style='width:50%'><div style='margin-bottom:6px'><b>Appraiser:</b> " + esc(a.cert.appraiserName || "_______________________") + "</div><div style='margin-bottom:6px'><b>PRC License No.:</b> " + esc(a.cert.prcNo || "_______________________") + "</div><div style='margin-bottom:6px'><b>PTR No.:</b> " + esc(a.cert.ptrNo || "_______________________") + "</div><div><b>Date:</b> " + esc(a.cert.date || "_______________________") + "</div></div></div>" +
      (a.finalConfirmed ? "<p style='font-size:10px;color:#98A5B8'>Final value opinion confirmed by " + esc(a.confirmedBy) + " on " + new Date(a.confirmedAt).toLocaleString() + ".</p>" : "") });

    const photos = a.photos || [];
    const polyPts = prop.landPolygon && prop.landPolygon.length ? prop.landPolygon : [];
    sections.push({ title: "10. Addenda", html: (comps.length ? "<h3>Comparable Data Sheets</h3><table><tr><th>#</th><th>Address</th><th>City</th><th>Price</th><th>Lot</th><th>Price/sqm</th><th>Type</th><th>Source</th></tr>" + comps.map((x, i) => "<tr><td>" + (i + 1) + "</td><td>" + esc(x.address) + "</td><td>" + esc(x.city) + "</td><td>" + C.money(x.price) + "</td><td>" + C.numFmt(x.lotArea) + "</td><td>" + C.money(x.rawPsm) + "</td><td>" + esc(x.transactionType) + "</td><td>" + esc(x.source) + "</td></tr>").join("") + "</table>" : "<p>None.</p>") +
      (polyPts.length >= 3 ? "<h3>Plotted Land Boundary</h3>" + apprPlotSketch(polyPts, prop.plotArea) + "<p class='dim' style='font-size:11px'>Sketch normalized from the plotted boundary — approximate shape, not to survey scale.</p>" : "") +
      "<p><b>Location map:</b> manual screenshot placeholder (attach a site / satellite map here).</p>" +
      (photos.length ? "<h3>Subject Photos</h3><div style='display:flex;flex-wrap:wrap;gap:12px'>" + photos.map(p => "<div style='width:46%;box-sizing:border-box'><img src='" + p.dataUrl + "' alt='" + esc(p.caption || p.name || "Subject photo") + "' style='width:100%;height:auto;border:1px solid #CBD4DF;border-radius:6px'>" + (p.cover ? "<p style='margin:6px 0 0;font-size:10px;color:#EA580C;font-weight:600'>Cover photo</p>" : "") + (p.caption ? "<p style='margin:2px 0 0;font-size:10px;color:#667'>" + esc(p.caption) + "</p>" : "") + "</div>").join("") + "</div>" : "<p><b>Subject photos:</b> none attached.</p>") +
      "<p style='font-size:10px;color:#98A5B8'>" + APPRAISAL_NOTICE + "</p>" });

    return reportHTML("Valuation Report (Draft — PVS 3rd Ed. aligned)", meta, sections, "#EA580C");
  }

  function appraisalExportGrid() {
    const a = activeAppraisal();
    const res = appraisalRes();
    const rows = C.APPRAISAL_ELEMENTS.map(el => [el].concat((res ? res.sales.adjusted : []).map(x => { const cell = x.cells.find(cc => cc.element === el); return cell ? cell.value : 0; })));
    const compHeads = res ? res.sales.adjusted.map((x, i) => "Comp " + (i + 1) + " — " + x.address) : [];
    exportXLS("appraisal_adjustment_grid.xls", [
      { name: "Adjustment Grid", headers: ["Element of Comparison"].concat(compHeads), rows: rows.concat([["Net Adjustment"].concat(res ? res.sales.adjusted.map(x => x.totalPct) : []), ["Adjusted Price/sqm"].concat(res ? res.sales.adjusted.map(x => x.adjPsm) : [])]) },
      { name: "Comparables", headers: ["Address", "City", "Price", "Lot Area", "Price/sqm", "Type", "Source"], rows: (res ? res.sales.adjusted : []).map(x => [x.address, x.city, x.price, x.lotArea, x.rawPsm, x.transactionType, x.source]) }
    ]);
    toast("Adjustment grid exported (Excel)");
  }

  function appraisalExportCalc() {
    const a = activeAppraisal();
    const res = appraisalRes();
    if (!res) { toast("Run approaches first", "err"); return; }
    const rows = [
      ["Appraisal", a.name || "(not named)"],
      ["Final Value — Sales Comparison", apprFV(a, "sales") != null ? apprFV(a, "sales") : res.sales.indicated], ["Weighted avg /sqm", res.sales.wAvgPsm],
      ["Final Value — Cost Approach", apprFV(a, "cost") != null ? apprFV(a, "cost") : res.cost.indicated], ["Land value", res.cost.landValue], ["Replacement cost new", res.cost.rcn], ["Total depreciation", res.cost.depAmt],
      ["Final Value — Income Capitalization", res.income ? (apprFV(a, "income") != null ? apprFV(a, "income") : res.income.indicated) : "n/a"], ["NOI", res.income ? res.income.noi : "n/a"], ["Cap rate", res.income ? res.income.capRate : "n/a"],
      ["Final value opinion", a.finalValue], ["Status", a.status]
    ];
    exportCSV("appraisal_calculations.csv", [["Metric", "Value"]].concat(rows.map(x => [x[0], String(x[1])])));
    toast("Calculations exported (CSV)");
  }

  function printReportPDF() {
    const root = $("#print-root");
    let html = "";
    try { html = appraisalReportHTML(); }
    catch (e) {
      root.innerHTML = "";
      toast("Could not build the report: " + (e.message || e), "err");
      return;
    }
    root.innerHTML = html;
    window.print();
    setTimeout(() => { root.innerHTML = ""; }, 800);
    toast("Print dialog opened — choose 'Save as PDF' as the destination");
  }

  function bindAppraisal() {
    $$("#content [data-atab]").forEach(b => b.addEventListener("click", () => { state.appraisalTab = b.getAttribute("data-atab"); save(); render(); }));
    $$("#content [data-atab-go]").forEach(b => b.addEventListener("click", () => { state.appraisalTab = b.getAttribute("data-atab-go"); save(); render(); }));
    const a = activeAppraisal();

    const set = (id, fn) => { const el = $("#" + id); if (el) el.addEventListener("input", fn); };
    set("ap-purpose", e => { a.purpose = e.target.value; a.updatedAt = Date.now(); });
    set("ap-basis", e => { a.basisOfValue = e.target.value; const d = $("#ap-basis-def"); if (d) d.textContent = VALUE_BASES[e.target.value] || ""; a.updatedAt = Date.now(); });
    set("ap-effect", e => { a.effectiveDate = e.target.value; a.updatedAt = Date.now(); });
    set("ap-assump", e => { a.extraordinaryAssumptions = e.target.value; a.updatedAt = Date.now(); });
    set("ap-scope", e => { a.scopeOfWork = e.target.value; a.updatedAt = Date.now(); });
    set("ap-recnote", e => { a.reconciliationNotes = e.target.value; a.updatedAt = Date.now(); });

    $$("#content [data-c]").forEach(el => {
      const id = el.getAttribute("data-id"), key = el.getAttribute("data-c");
      el.addEventListener("input", () => {
        const c = (a.comparables || []).find(x => x.id === id);
        if (!c) return;
        c.sample = false;
        c[key] = el.classList.contains("input-num") ? (C.num(el.value) || 0) : el.value;
        a.updatedAt = Date.now();
      });
    });

    const aiBtn = $("#ap-ai-adj");
    if (aiBtn) aiBtn.addEventListener("click", () => { appraisalSuggestAll(); render(); toast("AI adjustments applied — every cell is editable and flagged", "info"); });
    const clearBtn = $("#ap-clear-adj");
    if (clearBtn) clearBtn.addEventListener("click", () => { a.adjustments = []; save(); render(); toast("Adjustments cleared"); });
    $$("#content [data-adj]").forEach(el => {
      el.addEventListener("input", () => {
        const id = el.getAttribute("data-adj"), elName = el.getAttribute("data-el");
        const old = a.adjustments.find(x => x.comparableId === id && x.element === elName);
        const newVal = C.num(el.value);
        if (old && old.isAiSuggested && old.value !== newVal) {
          appraisalAudit("Manual override of AI-suggested adjustment '" + elName + "' on " + id + ": " + old.value + "% → " + newVal + "%");
          old.isAiSuggested = false;
        }
        setAppraisalCell(id, elName, newVal, false);
        save();
        updateAdjTotals();
      });
    });

    const addComp = $("#ap-add-comp");
    if (addComp) addComp.addEventListener("click", () => {
      const ap = apprProperty(a);
      a.comparables.push({ id: "c" + Date.now() + "-" + Math.floor(Math.random() * 1000), address: "", city: ap.city || "", saleDate: "", price: 0, lotArea: C.num(ap.lotArea, 0) || 200, floorArea: 0, propertyType: "Vacant Lot", transactionType: "Arm\u2019s-length Sale", source: "Broker", lat: "", lng: "", sample: false });
      save(); render();
    });
    const sampleBtn = $("#ap-sample-comp");
    if (sampleBtn) sampleBtn.addEventListener("click", () => { a.comparables = sampleComparables(a); save(); render(); toast("Sample comparables loaded — replace with real data"); });
    $$("#content [data-rm-comp]").forEach(b => b.addEventListener("click", () => {
      const id = b.getAttribute("data-rm-comp");
      a.comparables = (a.comparables || []).filter(x => x.id !== id);
      a.adjustments = a.adjustments.filter(x => x.comparableId !== id);
      appraisalAudit("Comparable removed: " + id);
      save(); render();
    }));

    const nameInp = $("#ap-name");
    if (nameInp) nameInp.addEventListener("input", () => {
      a.name = nameInp.value;
      if (a.status === "Draft" && a.name.trim()) {
        a.status = "In Progress";
        appraisalAudit("Appraisal named '" + a.name.trim() + "' — moved to In Progress and autosaved");
      }
      a.updatedAt = Date.now();
      save();
      const list = $("#ap-list");
      if (list) list.innerHTML = savedAppraisalsHtml(($("#ap-search") || {}).value || "");
    });
    const searchInp = $("#ap-search");
    if (searchInp) searchInp.addEventListener("input", () => { const list = $("#ap-list"); if (list) list.innerHTML = savedAppraisalsHtml(searchInp.value); });
    $$("#content [data-load-appr]").forEach(b => b.addEventListener("click", () => {
      const sv = state.appraisals.find(x => x.id === b.getAttribute("data-load-appr"));
      if (sv) {
        state.appraisal = normalizeAppraisal(JSON.parse(JSON.stringify(sv)));
        save(); render(); toast("Appraisal loaded — pick up where you left off");
      }
    }));
    $$("#content [data-rm-appr]").forEach(b => b.addEventListener("click", () => {
      const sv = state.appraisals.find(x => x.id === b.getAttribute("data-rm-appr"));
      if (sv && confirm('Delete saved appraisal "' + (sv.name || "Untitled") + '"?')) {
        state.appraisals = state.appraisals.filter(x => x.id !== sv.id);
        if (state.appraisal && state.appraisal.id === sv.id) {
      state.appraisal = freshAppraisal();
      state.appraisal.comparables = sampleComparables(state.appraisal);
          toast("Saved appraisal deleted — started a new appraisal");
        } else {
          toast("Saved appraisal deleted", "err");
        }
        save(); render();
      }
    }));
    const resetEng = $("#ap-reset");
    if (resetEng) resetEng.addEventListener("click", () => {
      if (!confirm("Start a new appraisal? Current working data will be reset.")) return;
      state.appraisal = freshAppraisal();
      state.appraisal.comparables = sampleComparables(state.appraisal);
      save(); render(); toast("New appraisal started — name it to autosave");
    });

    // Property details form (independent of New Investment wizard)
    const pd0 = a.propertyDetails || {};
    const apWantSearch = _forceMapSearch || !(pd0.lat && pd0.lng);
    const apSearchText = apWantSearch ? (pd0.city || pd0.province || "") : "";
    initAppraisalMap("ap-map", pd0.lat, pd0.lng, (lat, lng) => {
      a.propertyDetails.lat = lat;
      a.propertyDetails.lng = lng;
      a.updatedAt = Date.now();
      appraisalAudit("Property coordinates pinned on map (" + lat + ", " + lng + ")");
      save();
    }, pd0.landPolygon, (points, area) => {
      a.propertyDetails.landPolygon = points;
      a.propertyDetails.plotArea = area;
      a.updatedAt = Date.now();
      appraisalAudit("Land boundary plotted on map (" + points.length + " points, ≈ " + C.fmtNum(area) + " sqm)");
      save();
      toast("Land plot saved — ≈ " + C.fmtNum(area) + " sqm", "ok");
    }, apSearchText);
    _forceMapSearch = false;
    $$("#content [data-ap-pd]").forEach(inp => {
      const saveVal = () => {
        const k = inp.getAttribute("data-ap-pd");
        if (!a.propertyDetails || typeof a.propertyDetails !== "object") a.propertyDetails = {};
        a.propertyDetails[k] = (inp.tagName === "SELECT") ? inp.value : (inp.classList.contains("input-num") ? (inp.value === "" ? "" : C.num(inp.value)) : inp.value);
        if (k === "region") { a.propertyDetails.province = ""; a.propertyDetails.city = ""; }
        else if (k === "province") { a.propertyDetails.city = ""; }
        a.updatedAt = Date.now();
        save();
        if (k === "region" || k === "province") { _forceMapSearch = true; render(); }
        else if (k === "city" && inp.value) searchMapOnPicker("ap-map", inp.value);
      };
      inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", saveVal);
    });

    // Subject photos
    const photoInput = $("#ap-photos");
    if (photoInput) photoInput.addEventListener("change", () => {
      if (!photoInput.files.length) return;
      readPhotoFiles(photoInput.files, added => {
        if (!added.length) return;
        const now = Date.now();
        added.forEach((p, i) => {
          a.photos.push({ id: "photo-" + now + "-" + i, name: p.name || "", dataUrl: p.dataUrl, caption: "", cover: !a.photos.length && i === 0, at: now });
        });
        a.updatedAt = now;
        appraisalAudit(a.photos.length - added.length ? "Property photos updated (" + a.photos.length + " total)" : "Property photos attached (" + added.length + ")");
        save(); render(); toast(a.photos.length + " photo(s) attached", "ok");
      });
    });
    $("#ap-photo-grid") && $("#ap-photo-grid").addEventListener("click", ev => {
      const btn = ev.target.closest("[data-photo-rm], [data-photo-cover]");
      if (!btn) return;
      const id = btn.getAttribute("data-photo-rm") || btn.getAttribute("data-photo-cover");
      const ph = a.photos.find(x => x.id === id);
      if (!ph) return;
      if (btn.hasAttribute("data-photo-rm")) {
        if (!confirm('Remove this photo? It will be dropped from the report Addenda.')) return;
        a.photos = a.photos.filter(x => x.id !== id);
        if (ph.cover && a.photos.length) a.photos[0].cover = true;
        a.updatedAt = Date.now();
        save(); render(); toast("Photo removed", "err");
      } else {
        a.photos.forEach(x => { x.cover = x.id === id; });
        a.updatedAt = Date.now();
        save(); render(); toast("Cover photo set");
      }
    });
    $("#ap-photo-grid") && $("#ap-photo-grid").addEventListener("input", ev => {
      const cap = ev.target.closest("[data-photo-cap]");
      if (!cap) return;
      const ph = a.photos.find(x => x.id === cap.getAttribute("data-photo-cap"));
      if (ph) { ph.caption = cap.value; a.updatedAt = Date.now(); save(); }
    });

    // Approaches live recalc
    const recalcApproaches = () => {
      a.cost.landValuePerSqm = C.num(($("#apc-land") || {}).value);
      a.cost.rcnPerSqm = C.num(($("#apc-rcn") || {}).value);
      a.cost.bldgArea = C.num(($("#apc-bldg") || {}).value);
      a.cost.depPhysical = C.num(($("#apc-depP") || {}).value);
      a.cost.depFunctional = C.num(($("#apc-depF") || {}).value);
      a.cost.depEconomic = C.num(($("#apc-depE") || {}).value);
      a.cost.depNote = ($("#apc-depNote") || {}).value || "";
      a.income.gpi = C.num(($("#api-gpi") || {}).value);
      a.income.vacancyPct = C.num(($("#api-vac") || {}).value);
      a.income.opexPct = C.num(($("#api-opex") || {}).value);
      a.income.capRate = C.num(($("#api-cap") || {}).value);
      a.income.capRateNote = ($("#api-capNote") || {}).value || "";
      a.updatedAt = Date.now();
      save();
      const res = appraisalRes();
      const oc = $("#apc-out");
      if (oc && res) oc.innerHTML = costOutHtml(res);
      const oi = $("#api-out");
      if (oi && res) oi.innerHTML = incomeOutHtml(res, a);
    };
    ["apc-land", "apc-rcn", "apc-bldg", "apc-depP", "apc-depF", "apc-depE", "apc-depNote", "api-gpi", "api-vac", "api-opex", "api-cap", "api-capNote"].forEach(id => set(id, recalcApproaches));
    const useInc = $("#api-use");
    if (useInc) useInc.addEventListener("change", () => { a.income.useIncome = useInc.checked; save(); render(); });

    // Per-approach labeled Final Values (Approaches tab)
    ["sales", "cost", "income"].forEach(key => {
      const btn = $("#ap-fv-" + key + "-btn");
      if (btn) btn.addEventListener("click", () => {
        const res = appraisalRes();
        const live = key === "sales" ? (res ? res.sales.indicated : null) : key === "cost" ? (res ? res.cost.indicated : null) : (res && res.income ? res.income.indicated : null);
        if (live == null) { toast("No computed value to save for the " + APPROACH_TITLES[key], "err"); return; }
        a.approachResults[key] = { finalValue: Math.round(live), at: Date.now() };
        appraisalAudit("Final Value — " + APPROACH_TITLES[key] + " saved at " + C.money(Math.round(live)) + " (recalculated)");
        save(); render(); toast("Final Value saved — " + APPROACH_TITLES[key]);
      });
      const inp = $("#ap-fv-" + key + "-input");
      if (inp) inp.addEventListener("input", () => {
        a.approachResults[key] = a.approachResults[key] || {};
        a.approachResults[key].finalValue = inp.value !== "" ? C.num(inp.value) : null;
        a.approachResults[key].at = Date.now();
        save();
        const at = $("#ap-fv-" + key + "-at");
        if (at) at.textContent = a.approachResults[key].finalValue != null && !isNaN(a.approachResults[key].finalValue) ? "Saved " + new Date().toLocaleString() : "Not yet saved";
      });
    });

    // Reconciliation
    const aiRec = $("#ap-ai-rec");
    if (aiRec) aiRec.addEventListener("click", () => {
      const res = appraisalRes();
      if (!res) { toast("Compute approaches first", "err"); return; }
      a.reconciliationNotes = C.appraisalReconcileDraft(res, a);
      appraisalAudit("AI-drafted reconciliation notes generated (advisory)");
      save(); render(); toast("AI draft inserted — advisory only, appraiser must revise");
    });
    const confirmBtn = $("#ap-confirm");
    if (confirmBtn) confirmBtn.addEventListener("click", () => {
      if (!a.name || !a.name.trim()) { toast("Give the appraisal a name (Setup tab) before confirming the final value opinion", "err"); return; }
      const single = C.num(($("#ap-final") || {}).value);
      const lo = C.num(($("#ap-final-min") || {}).value);
      const hi = C.num(($("#ap-final-max") || {}).value);
      if (single > 0) { a.finalValue = single; a.finalMin = null; a.finalMax = null; }
      else if (lo > 0 && hi > 0) { a.finalValue = Math.round((lo + hi) / 2); a.finalMin = lo; a.finalMax = hi; }
      else { toast("Enter a single final value or a low–high range", "err"); return; }
      a.finalConfirmed = true; a.confirmedBy = currentUser ? (currentUser.name || currentUser.email) : "appraiser"; a.confirmedAt = Date.now();
      if (a.status !== "Certified") a.status = "Complete";
      appraisalAudit("Final value opinion CONFIRMED at " + C.money(a.finalValue) + " by " + a.confirmedBy + " — status Complete");
      save(); render(); toast("Final value opinion confirmed — status Complete, logged to audit trail");
    });
    const unconfirm = $("#ap-unconfirm");
    if (unconfirm) unconfirm.addEventListener("click", () => {
      a.finalConfirmed = false;
      if (a.status === "Complete") a.status = "In Progress";
      appraisalAudit("Final value opinion unlocked for revision — status In Progress");
      save(); render();
    });
    set("ap-final", e => { a.finalValue = C.num(e.target.value) || null; a.updatedAt = Date.now(); });
    set("ap-final-min", e => { a.finalMin = C.num(e.target.value) || null; a.updatedAt = Date.now(); });
    set("ap-final-max", e => { a.finalMax = C.num(e.target.value) || null; a.updatedAt = Date.now(); });

    // Report / certification
    const certEls = { name: "apc-name", prc: "apc-prc", ptr: "apc-ptr", date: "apc-date" };
    Object.keys(certEls).forEach(k => set(certEls[k], e => { a.cert[k === "name" ? "appraiserName" : k === "prc" ? "prcNo" : k === "ptr" ? "ptrNo" : "date"] = e.target.value; a.updatedAt = Date.now(); }));
    const preview = $("#ap-preview");
    if (preview) preview.addEventListener("click", printReportPDF);
    const xlsGrid = $("#ap-xls-grid");
    if (xlsGrid) xlsGrid.addEventListener("click", appraisalExportGrid);
    const xlsCalc = $("#ap-xls-calc");
    if (xlsCalc) xlsCalc.addEventListener("click", appraisalExportCalc);
    const stReview = $("#ap-status-review");
    if (stReview) stReview.addEventListener("click", () => {
      if (!a.name || !a.name.trim()) { toast("Give the appraisal a name before reviewing", "err"); return; }
      if (a.status === "Certified") { toast("Certified appraisal cannot return to Under Review — unlock first", "err"); return; }
      a.status = "Under Review"; appraisalAudit("Status changed to Under Review"); save(); render(); toast("Status → Under Review");
    });
    const stCert = $("#ap-status-cert");
    if (stCert) stCert.addEventListener("click", () => {
      const msg = $("#ap-cert-msg");
      if (!a.name || !a.name.trim()) { msg.innerHTML = '<div class="notice-banner warn">' + icon("shield", 14) + ' <span>Cannot certify: give the appraisal a name first (Setup tab).</span></div>'; return; }
      if (!a.finalConfirmed) { msg.innerHTML = '<div class="notice-banner warn">' + icon("shield", 14) + ' <span>Cannot certify: the final value opinion has not been confirmed. Confirm it in the Reconciliation tab first.</span></div>'; return; }
      if (!a.cert.appraiserName || !a.cert.prcNo || !a.cert.ptrNo) { msg.innerHTML = '<div class="notice-banner warn">' + icon("shield", 14) + ' <span>Cannot certify: appraiser name, PRC License No., and PTR No. must be filled for manual sign-off.</span></div>'; return; }
      a.status = "Certified";
      appraisalAudit("Marked CERTIFIED — signed off by " + a.cert.appraiserName + " (PRC " + a.cert.prcNo + ", PTR " + a.cert.ptrNo + ") on " + (a.cert.date || new Date().toLocaleDateString()));
      save(); render();
      msg.innerHTML = '<div class="notice-banner">' + icon("check", 14) + ' <span>Certified. Sign-off event logged to the audit trail with user, timestamp, and license number.</span></div>';
    });
  }

  function updateAdjTotals() {
    const a = activeAppraisal();
    const comps = (a.comparables || []).filter(c => C.num(c.lotArea, 0) > 0);
    comps.forEach((c, i) => {
      const cells = a.adjustments.filter(x => x.comparableId === c.id);
      const total = cells.reduce((s, x) => s + C.num(x.value, 0), 0);
      const adjPsm = C.num(c.lotArea, 1) > 0 ? C.num(c.price, 0) * (1 + total / 100) / C.num(c.lotArea, 1) : 0;
      const row = $$("#content .adj-grid tr.totals td")[i + 1];
      if (row) row.innerHTML = "<b>" + C.pct(total / 100) + "</b><div class='dim tiny'>" + C.money(adjPsm) + "/sqm adj.</div>";
    });
  }

  /* ================= PMS (Property Management) ================= */
  const PMS_TABS = [
    ["properties", "Properties"], ["units", "Units"], ["owners", "Owners"],
    ["tenants", "Tenants"], ["leases", "Leases"], ["payments", "Payments"],
    ["maintenance", "Maintenance"], ["expenses", "Expenses"],
    ["documents", "Documents"], ["reports", "Reports"]
  ];
  const PMS_NEW = {
    properties: ["property", "Property"], units: ["unit", "Unit"], owners: ["owner", "Owner"],
    tenants: ["tenant", "Tenant"], leases: ["lease", "Lease"], payments: ["payment", "Payment"],
    maintenance: ["maintenance", "Work Order"], expenses: ["expense", "Expense"], documents: ["document", "Document"]
  };
  const PROPERTY_TYPES = ["Residential", "Commercial", "Land"];
  const PROPERTY_STATUSES = [
    { value: "for sale", label: "For Sale", color: "blue" },
    { value: "for rent", label: "For Rent", color: "cyan" },
    { value: "sold", label: "Sold", color: "purple" },
    { value: "leased", label: "Leased", color: "gold" },
    { value: "off-market", label: "Off-Market", color: "green" }
  ];
  const UNIT_STATUSES = [
    { value: "vacant", label: "Vacant", color: "green" },
    { value: "occupied", label: "Occupied", color: "blue" },
    { value: "maintenance", label: "Maintenance", color: "gold" }
  ];
  const LEASE_STATUSES = [
    { value: "active", label: "Active", color: "green" },
    { value: "expiring", label: "Expiring Soon", color: "gold" },
    { value: "expired", label: "Expired", color: "red" },
    { value: "terminated", label: "Terminated", color: "purple" }
  ];
  const PAYMENT_STATUSES = [
    { value: "paid", label: "Paid", color: "green" },
    { value: "due", label: "Payment Due", color: "gold" },
    { value: "pending", label: "Pending", color: "gold" },
    { value: "late", label: "Late", color: "red" }
  ];
  const PAYMENT_METHODS = ["Cash", "Bank Transfer", "GCash", "Maya", "Check"];
  const MAINT_PRIORITIES = [["high", "High"], ["medium", "Medium"], ["low", "Low"]];
  const MAINT_CATEGORIES = ["Plumbing", "Electrical", "HVAC", "Structural", "Pest Control", "General Repair", "Other"];
  const MAINT_STATUSES = [
    { value: "open", label: "Open", color: "gold" },
    { value: "in progress", label: "In Progress", color: "blue" },
    { value: "completed", label: "Completed", color: "green" },
    { value: "closed", label: "Closed", color: "red" }
  ];
  const EXPENSE_CATEGORIES = ["Utilities", "Repairs", "Maintenance", "Property Tax", "Insurance", "Association Dues", "Marketing", "Legal", "Cleaning", "Other"];
  const DOC_CATEGORIES = ["Contract", "Lease", "Deed", "Permit", "Tax", "Insurance", "Other"];
  const ROLES = [
    { value: "super-admin", label: "Super Admin" },
    { value: "broker", label: "Broker (PRC-licensed)" },
    { value: "agent", label: "Agent" },
    { value: "buyer", label: "Buyer / Client" },
    { value: "seller", label: "Seller / Developer" },
    { value: "owner", label: "Owner" },
    { value: "tenant", label: "Tenant" }
  ];
  function roleCfg(r) { return ROLES.find(x => x.value === r); }
  function roleLabel(r) { const c = roleCfg(r); return c ? c.label : "Unassigned"; }
  function userRole() { return (currentUser && currentUser.role) || ""; }
  function pmsCan(perm) { return can("pms." + (perm || "view")); }
  function pms() {
    if (!state.pms) state.pms = {};
    const empty = ["properties", "units", "owners", "tenants", "leases", "payments", "maintenance", "expenses", "documents"];
    empty.forEach(k => { if (!Array.isArray(state.pms[k])) state.pms[k] = []; });
    return state.pms;
  }
  function pmsNewId(kind) { return kind.charAt(0) + "-" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function pmsOwnerName(id) { const o = pms().owners.find(x => x.id === id); return o ? o.name : "—"; }
  function pmsPropertyTitle(id) { const p = pms().properties.find(x => x.id === id); return p ? p.title : "Untitled"; }
  function pmsTenantName(id) { const t = pms().tenants.find(x => x.id === id); return t ? t.name : "—"; }
  function pmsUnitName(id) { const u = pms().units.find(x => x.id === id); return u ? (u.unit_number || "Unit") : "—"; }
  function pmsStatusBadge(cfg, label) {
    return '<span class="badge ' + (cfg ? cfg.color : "green") + '">' + esc(label) + '</span>';
  }
  function pmsActiveOwners() { return pms().owners.filter(o => !o.archived); }
  function pmsActiveProperties() { return pms().properties.filter(p => !p.archived); }
  function pmsActiveUnits() { return pms().units.filter(u => !u.archived); }
  function pmsActiveTenants() { return pms().tenants.filter(t => !t.archived); }
  function pmsActiveLeases() { return pms().leases.filter(l => !l.archived); }
  function pmsActivePayments() { return pms().payments.filter(p => !p.archived); }
  function pmsActiveMaintenance() { return pms().maintenance.filter(m => !m.archived); }
  function pmsActiveExpenses() { return pms().expenses.filter(e => !e.archived); }
  function pmsActiveDocuments() { return pms().documents.filter(d => !d.archived); }
  function pmsLeaseLabel(l) {
    if (!l) return "—";
    return pmsTenantName(l.tenant_id) + " \u00B7 " + pmsPropertyTitle(l.property_id) + " " + pmsUnitName(l.unit_id);
  }
  function pmsPaySum(list, statuses) {
    return list.filter(p => statuses.indexOf(p.status) !== -1).reduce((s, p) => s + C.num(p.amount, 0), 0);
  }
  function pmsPaidByMonth(leaseId) {
    const map = {};
    pmsActivePayments().forEach(p => {
      if (p.lease_id !== leaseId || p.status !== "paid") return;
      let key = String(p.month || "").trim().toLowerCase();
      if (!key && p.date) {
        const dt = new Date(String(p.date).slice(0, 10) + "T00:00:00");
        if (!isNaN(dt.getTime())) key = pmsMonthLabel(new Date(dt.getFullYear(), dt.getMonth(), 1)).toLowerCase();
      }
      if (key) map[key] = (map[key] || 0) + C.num(p.amount, 0);
    });
    return map;
  }
  function pmsLeaseArrears(l) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const pays = pmsActivePayments().filter(p => p.lease_id === l.id);
    if (l.rent_type === "lease") {
      const end = l.end ? new Date(String(l.end).slice(0, 10) + "T00:00:00") : null;
      if (end && end.getTime() >= today.getTime()) return 0;
      const paidTotal = pays.filter(p => p.status === "paid").reduce((s, p) => s + C.num(p.amount, 0), 0);
      return Math.max(0, C.num(l.rent, 0) - paidTotal);
    }
    const paidByMonth = pmsPaidByMonth(l.id);
    const start = l.start ? new Date(String(l.start).slice(0, 10) + "T00:00:00") : new Date(today.getFullYear(), today.getMonth(), 1);
    const end = l.end ? new Date(String(l.end).slice(0, 10) + "T00:00:00") : null;
    const dd = pmsDueDay(l);
    let total = 0, guard = 0;
    for (let y = start.getFullYear(), mo = start.getMonth(); guard < 120; guard++) {
      const monthStart = new Date(y, mo, 1);
      if (monthStart > today) break;
      if (end && monthStart > end) break;
      const dueDate = new Date(y, mo, dd);
      if (dueDate.getTime() < today.getTime()) {
        const label = pmsMonthLabel(monthStart).toLowerCase();
        const amt = C.num(l.rent, 0);
        total += Math.max(0, amt - Math.min(paidByMonth[label] || 0, amt));
      }
      mo++; if (mo > 11) { mo = 0; y++; }
    }
    return total;
  }
  function pmsArrearsFor(list) { return (list || []).reduce((s, l) => s + pmsLeaseArrears(l), 0); }
  function pmsMonthLabel(d) { return d.toLocaleString("en-US", { month: "long", year: "numeric" }); }
  function pmsMonthOptions(extra) {
    const out = [], seen = {};
    const now = new Date();
    for (let i = -12; i <= 2; i++) {
      const label = pmsMonthLabel(new Date(now.getFullYear(), now.getMonth() + i, 1));
      if (!seen[label]) { seen[label] = true; out.push([label, label]); }
    }
    if (extra && !seen[extra]) out.push([extra, extra]);
    return out;
  }
  function pmsDispDate(d) { return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }); }
  function pmsDueDay(lease) {
    const v = lease ? lease.due_day : "";
    if (v === "wlast") return 25;
    if (v === "w2") return 10;
    const n = Math.floor(C.num(v, 0));
    if (n > 0) return Math.min(28, Math.max(1, n));
    return 10;
  }
  function pmsLeaseDueInfo(l) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dd = pmsDueDay(l);
    const curDue = new Date(today.getFullYear(), today.getMonth(), dd);
    const curLabel = pmsMonthLabel(today);
    const inPeriod = p => {
      const m = String(p.month || "").trim().toLowerCase();
      if (m && m === curLabel.toLowerCase()) return true;
      if (p.date) {
        const dt = new Date(String(p.date).slice(0, 10) + "T00:00:00");
        if (!isNaN(dt.getTime()) && dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth()) return true;
      }
      return false;
    };
    const pays = pmsActivePayments().filter(p => p.lease_id === l.id && inPeriod(p));
    const paid = pays.some(p => p.status === "paid");
    const late = pays.some(p => p.status === "late");
    let state;
    if (paid) state = "paid";
    else if (late || today.getTime() > curDue.getTime()) state = "overdue";
    else state = "due";
    const nextDue = paid ? new Date(today.getFullYear(), today.getMonth() + 1, dd) : curDue;
    return { curDue: curDue, nextDue: nextDue, label: curLabel, paid: paid, state: state };
  }
  function pmsUnpaidMonths(l) {
    const out = [];
    const paidKeys = {};
    pmsActivePayments().forEach(p => {
      if (p.lease_id !== l.id || p.status !== "paid") return;
      const m = String(p.month || "").trim().toLowerCase();
      if (m) paidKeys[m] = true;
      if (p.date) {
        const dt = new Date(String(p.date).slice(0, 10) + "T00:00:00");
        if (!isNaN(dt.getTime())) paidKeys[dt.getFullYear() + "-" + (dt.getMonth() + 1)] = true;
      }
    });
    const today = new Date();
    const start = l.start ? new Date(String(l.start).slice(0, 10) + "T00:00:00") : new Date(today.getFullYear(), today.getMonth(), 1);
    let count = 0;
    for (let y = start.getFullYear(); y <= today.getFullYear() && count < 36; y++) {
      const mStart = y === start.getFullYear() ? start.getMonth() : 0;
      const mEnd = y === today.getFullYear() ? today.getMonth() : 11;
      for (let mo = mStart; mo <= mEnd && count < 36; mo++) {
        const label = pmsMonthLabel(new Date(y, mo, 1));
        const byLabel = paidKeys[label.toLowerCase()] || false;
        const byDate = paidKeys[y + "-" + (mo + 1)] || false;
        if (byLabel || byDate) continue;
        out.push({ label: label, date: new Date(y, mo, pmsDueDay(l)) });
        count++;
      }
    }
    return out;
  }
  function pmsTenantPayable(l) {
    const pays = pmsActivePayments().filter(p => p.lease_id === l.id);
    const paidTotal = pays.filter(p => p.status === "paid").reduce((s, p) => s + C.num(p.amount, 0), 0);
    const rows = [];
    if (l.rent_type === "lease") {
      const total = C.num(l.rent, 0);
      rows.push({ label: "Lease total", due: null, amount: total, status: total > 0 && paidTotal >= total ? "paid" : (paidTotal > 0 ? "partial" : "due") });
    } else {
      const start = l.start ? new Date(String(l.start).slice(0, 10) + "T00:00:00") : new Date();
      const end = l.end ? new Date(String(l.end).slice(0, 10) + "T00:00:00") : start;
      const today = new Date();
      const paidKeys = {};
      pays.filter(p => p.status === "paid").forEach(p => {
        const m = String(p.month || "").trim().toLowerCase();
        if (m) paidKeys[m] = true;
        if (p.date) {
          const dt = new Date(String(p.date).slice(0, 10) + "T00:00:00");
          if (!isNaN(dt.getTime())) paidKeys[dt.getFullYear() + "-" + (dt.getMonth() + 1)] = true;
        }
      });
      let count = 0;
      for (let y = start.getFullYear(); y <= end.getFullYear() && count < 60; y++) {
        const mStart = y === start.getFullYear() ? start.getMonth() : 0;
        const mEnd = y === end.getFullYear() ? end.getMonth() : 11;
        for (let mo = mStart; mo <= mEnd && count < 60; mo++) {
          const label = pmsMonthLabel(new Date(y, mo, 1));
          const paid = paidKeys[label.toLowerCase()] || paidKeys[y + "-" + (mo + 1)];
          const due = new Date(y, mo, pmsDueDay(l));
          let status = "upcoming";
          if (paid) status = "paid";
          else if (due.getTime() < today.getTime()) status = "overdue";
          else status = "due";
          rows.push({ label: label, due: due, amount: C.num(l.rent, 0), status: status });
          count++;
        }
      }
    }
    return { rows: rows, paidTotal: paidTotal, total: rows.reduce((s, r) => s + r.amount, 0) };
  }
  function pmsFilterStatusOpts(tab) {
    if (tab === "properties") return PROPERTY_STATUSES;
    if (tab === "units") return UNIT_STATUSES;
    if (tab === "leases") return LEASE_STATUSES;
    if (tab === "payments") return PAYMENT_STATUSES;
    if (tab === "maintenance") return MAINT_STATUSES;
    return null;
  }
  function pmsUnitCapacity(u) { return Math.max(1, Math.floor(C.num(u ? u.bedrooms : 0, 0))); }
  function pmsUnitTenantCount(unitId) {
    return pmsActiveLeases().filter(l => l.unit_id === unitId && l.status === "active").length;
  }
  function pmsUnitTenants(unitId) {
    return pmsActiveLeases().filter(l => l.unit_id === unitId && l.status === "active").map(l => pmsTenantName(l.tenant_id)).filter(n => n && n !== "—");
  }
  function pmsAutoStatus(l) {
    if (!l || l.status === "terminated") return l ? l.status : "active";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = l.start ? new Date(String(l.start).slice(0, 10) + "T00:00:00") : null;
    const end = l.end ? new Date(String(l.end).slice(0, 10) + "T00:00:00") : null;
    if (start && today < start) return "active";
    if (!end) return "active";
    const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    if (today > end) return "expired";
    if (daysLeft <= 30) return "expiring";
    return "active";
  }
  function syncLeaseStatuses() {
    pmsActiveLeases().forEach(l => { l.status = pmsAutoStatus(l); });
  }
  function syncUnitFromLeases() {
    pmsActiveUnits().forEach(u => {
      const names = pmsUnitTenants(u.id);
      if (names.length) {
        u.status = "occupied";
        u.tenant_name = names.join(", ");
      } else if (u.status === "occupied") {
        u.status = "vacant";
        u.tenant_name = "";
      }
    });
  }
  function pmsVisibleProperties() {
    const list = pmsActiveProperties();
    if (userRole() === "owner") {
      const em = currentUser ? String(currentUser.email || "").toLowerCase() : "";
      return list.filter(p => {
        const o = pms().owners.find(x => x.id === p.owner_id);
        return o && String(o.email || "").toLowerCase() === em;
      });
    }
    return list;
  }
  function pmsEmpty(msg, sub) {
    return '<div class="empty">' + icon("folder", 46) + "<h3>" + msg + "</h3><p>" + sub + "</p></div>";
  }

  function renderPMS() {
    if (userRole() === "tenant") return pmsTenantPortal();
    if (userRole() === "owner") return pmsOwnerPortal();
    syncLeaseStatuses();
    syncUnitFromLeases();
    const tab = state.pmsTab || "properties";
    const canManage = pmsCan("manage");
    const props = pmsActiveProperties(), units = pmsActiveUnits(), owners = pmsActiveOwners(),
      tenants = pmsActiveTenants(), leases = pmsActiveLeases(), payments = pmsActivePayments();
    const activeLeases = leases.filter(l => l.status === "active");
    const collected = pmsPaySum(payments, ["paid"]);
    const arrears = pmsArrearsFor(activeLeases);
    const nb = PMS_NEW[tab];
    let html = '<div class="hero"><div><h1>Property Management</h1><p>Manage properties, units, owners, tenants, leases, and finances.</p></div>' +
      (canManage && nb ? '<div class="actions"><button class="btn btn-primary" data-pms-new="' + nb[0] + '">' + icon("plus", 15) + " New " + nb[1] + "</button></div>" : "") + '</div>';
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Properties", props.length, "active in the portfolio", "green", "briefcase") +
      kpi("Units", units.length, "across all properties", "blue", "layers") +
      kpi("Occupied Units", units.filter(u => u.status === "occupied").length, "of " + units.length + " units", "cyan", "check") +
      kpi("Owners", owners.length, "registered contacts", "purple", "star") + '</div>';
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Tenants", tenants.length, "on file", "blue", "star") +
      kpi("Active Leases", activeLeases.length, "of " + leases.length + " leases", "green", "doc") +
      kpi("Collected", C.money(collected), "all-time paid", "green", "dollar") +
      kpi("Arrears", C.money(arrears), "overdue rent", arrears > 0 ? "red" : "green", "trending") + '</div>';
    html += '<div class="tabs">' + PMS_TABS.map(t => '<button class="tab' + (state.pmsTab === t[0] ? " active" : "") + '" data-pmtab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>';
    html += renderPMSList();
    return html;
  }

  function renderPMSList() {
    const tab = state.pmsTab || "properties";
    if (tab === "reports") return '<div id="pms-list">' + pmsReports() + '</div>';
    let bar = '<div class="pms-bar">' +
      '<input class="input" id="pms-search" type="text" placeholder="Search ' + tab + '\u2026" value="' + esc(state.pmsQuery || "") + '">';
    if (tab === "units" || tab === "leases" || tab === "payments" || tab === "maintenance" || tab === "expenses" || tab === "documents") {
      bar += '<select class="input" id="pms-filter-property">' + '<option value="">All properties</option>' +
        pmsActiveProperties().map(p => '<option value="' + p.id + '"' + (state.pmsPropertyFilter === p.id ? " selected" : "") + '>' + esc(p.title) + '</option>').join("") + '</select>';
    }
    const so = pmsFilterStatusOpts(tab);
    if (so) {
      bar += '<select class="input" id="pms-filter-status">' + '<option value="">All statuses</option>' +
        so.map(s => '<option value="' + s.value + '"' + (state.pmsStatusFilter === s.value ? " selected" : "") + '>' + s.label + '</option>').join("") + '</select>';
    }
    if (tab === "maintenance") {
      bar += '<select class="input" id="pms-filter-extra">' + '<option value="">All priorities</option>' +
        MAINT_PRIORITIES.map(s => '<option value="' + s[0] + '"' + (state.pmsExtraFilter === s[0] ? " selected" : "") + '>' + s[1] + '</option>').join("") + '</select>';
    } else if (tab === "expenses") {
      bar += '<select class="input" id="pms-filter-extra">' + '<option value="">All categories</option>' +
        EXPENSE_CATEGORIES.map(c => '<option value="' + c + '"' + (state.pmsExtraFilter === c ? " selected" : "") + '>' + c + '</option>').join("") + '</select>';
    } else if (tab === "documents") {
      bar += '<select class="input" id="pms-filter-extra">' + '<option value="">All categories</option>' +
        DOC_CATEGORIES.map(c => '<option value="' + c + '"' + (state.pmsExtraFilter === c ? " selected" : "") + '>' + c + '</option>').join("") + '</select>';
    }
    bar += '</div>';
    return bar + '<div id="pms-list">' + renderPMSListInner() + '</div>';
  }

  function renderPMSListInner() {
    const tab = state.pmsTab || "properties";
    if (tab === "properties") return pmsListProperties();
    if (tab === "units") return pmsListUnits();
    if (tab === "owners") return pmsListOwners();
    if (tab === "tenants") return pmsListTenants();
    if (tab === "leases") return pmsListLeases();
    if (tab === "payments") return pmsListPayments();
    if (tab === "maintenance") return pmsListMaintenance();
    if (tab === "expenses") return pmsListExpenses();
    if (tab === "documents") return pmsListDocuments();
    if (tab === "reports") return pmsReports();
    return pmsEmpty("Nothing here", "Pick a tab to get started.");
  }

  function pmsListProperties() {
    const q = String(state.pmsQuery || "").toLowerCase();
    const sf = state.pmsStatusFilter || "";
    let list = pmsVisibleProperties();
    if (sf) list = list.filter(p => p.status === sf);
    if (q) list = list.filter(p => (p.title + " " + p.address + " " + p.city + " " + p.province + " " + pmsOwnerName(p.owner_id)).toLowerCase().indexOf(q) !== -1);
    if (!list.length) return pmsEmpty("No properties match", "Adjust your filters or add a new property.");
    const canManage = pmsCan("manage");
    let h = '<div class="table-wrap"><table class="data"><tr><th>Property</th><th>Location</th><th>Type</th><th>Status</th><th>Owner</th><th class="num">Price / Rent</th><th class="num">Units</th>' + (canManage ? "<th>Actions</th>" : "") + '</tr>';
    list.forEach(p => {
      const sc = PROPERTY_STATUSES.find(x => x.value === p.status);
      const units = pmsActiveUnits().filter(u => u.property_id === p.id);
      h += '<tr><td><b>' + esc(p.title || "Untitled") + '</b>' + (p.description ? '<div class="dim tiny">' + esc(String(p.description).slice(0, 60)) + '</div>' : "") + '</td>' +
        '<td>' + esc([p.barangay, p.city, p.province].filter(Boolean).join(", ") || p.address || "—") + '</td>' +
        '<td>' + esc(p.type || "—") + '</td>' +
        '<td>' + pmsStatusBadge(sc, sc ? sc.label : (p.status || "—")) + '</td>' +
        '<td>' + esc(pmsOwnerName(p.owner_id)) + '</td>' +
        '<td class="num">' + (C.num(p.price, 0) > 0 ? C.money(p.price) : "—") + (C.num(p.rent, 0) > 0 ? '<div class="dim tiny">' + C.money(p.rent) + '/mo</div>' : "") + '</td>' +
        '<td class="num">' + units.length + '</td>' +
        (canManage ? '<td><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-pms-edit="property:' + p.id + '">' + icon("edit", 13) + '</button><button class="btn btn-danger btn-sm" data-pms-archive="property:' + p.id + '">' + icon("archive", 13) + '</button></div></td>' : "") +
        '</tr>';
    });
    h += '</table></div>';
    return h;
  }

  function pmsListUnits() {
    const q = String(state.pmsQuery || "").toLowerCase();
    const sf = state.pmsStatusFilter || "";
    const pf = state.pmsPropertyFilter || "";
    let list = pmsActiveUnits();
    if (sf) list = list.filter(u => u.status === sf);
    if (pf) list = list.filter(u => u.property_id === pf);
    if (q) list = list.filter(u => (u.unit_number + " " + (u.tenant_name || "") + " " + pmsPropertyTitle(u.property_id)).toLowerCase().indexOf(q) !== -1);
    if (!list.length) return pmsEmpty("No units match", "Adjust your filters or add a new unit.");
    const canManage = pmsCan("manage");
    let h = '<div class="table-wrap"><table class="data"><tr><th>Property</th><th>Unit</th><th class="num">Occupant</th><th class="num">Bed / Bath</th><th class="num">Size</th><th class="num">Rent</th><th>Status</th>' + (canManage ? "<th>Actions</th>" : "") + '</tr>';
    list.forEach(u => {
      const sc = UNIT_STATUSES.find(x => x.value === u.status);
      const used = pmsUnitTenantCount(u.id), cap = pmsUnitCapacity(u), avail = Math.max(0, cap - used);
      const occBadge = used === 0 ? '<span class="badge green">Vacant</span>' : (avail === 0 ? '<span class="badge red">Full</span>' : '<span class="badge gold">' + avail + ' of ' + cap + ' open</span>');
      h += '<tr><td>' + esc(pmsPropertyTitle(u.property_id)) + '</td>' +
        '<td><b>' + esc(u.unit_number || "—") + '</b>' + (u.tenant_name ? '<div class="dim tiny">' + esc(u.tenant_name) + '</div>' : "") + '</td>' +
        '<td class="num">' + used + ' / ' + cap + ' ' + (cap === 1 ? "bed" : "beds") + '<div class="mt-8">' + occBadge + '</div></td>' +
        '<td class="num">' + (C.num(u.bedrooms, 0) > 0 ? C.num(u.bedrooms, 0) : "—") + ' / ' + (C.num(u.bathrooms, 0) > 0 ? C.num(u.bathrooms, 0) : "—") + '</td>' +
        '<td class="num">' + (C.num(u.size, 0) > 0 ? C.numFmt(u.size) + " sqm" : "—") + '</td>' +
        '<td class="num">' + (C.num(u.rent_amount, 0) > 0 ? C.money(u.rent_amount) + "/mo" : "—") + '</td>' +
        '<td>' + pmsStatusBadge(sc, sc ? sc.label : (u.status || "—")) + '</td>' +
        (canManage ? '<td><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-pms-edit="unit:' + u.id + '">' + icon("edit", 13) + '</button><button class="btn btn-danger btn-sm" data-pms-archive="unit:' + u.id + '">' + icon("archive", 13) + '</button></div></td>' : "") +
        '</tr>';
    });
    h += '</table></div>';
    return h;
  }

  function pmsListOwners() {
    const q = String(state.pmsQuery || "").toLowerCase();
    let list = pmsActiveOwners();
    if (q) list = list.filter(o => (o.name + " " + o.email + " " + o.phone + " " + o.company).toLowerCase().indexOf(q) !== -1);
    if (!list.length) return pmsEmpty("No owners match", "Adjust your search or add a new owner.");
    const canManage = pmsCan("manage");
    let h = '<div class="table-wrap"><table class="data"><tr><th>Owner</th><th>Contact</th><th class="num">Properties</th><th>Payout</th>' + (canManage ? "<th>Actions</th>" : "") + '</tr>';
    list.forEach(o => {
      const count = pmsActiveProperties().filter(p => p.owner_id === o.id).length;
      const accountStatus = o.accountStatus || (o.authUserId ? "pending" : "");
      h += '<tr><td><b>' + esc(o.name || "—") + '</b>' + (o.company ? '<div class="dim tiny">' + esc(o.company) + '</div>' : "") + (accountStatus ? '<div class="mt-8"><span class="badge ' + (accountStatus === "approved" ? "green" : accountStatus === "rejected" ? "red" : "gold") + '">User: ' + esc(accountStatus) + '</span></div>' : "") + '</td>' +
        '<td>' + (o.email ? '<div>' + esc(o.email) + '</div>' : "") + (o.phone ? '<div class="dim tiny">' + esc(o.phone) + '</div>' : "") + '</td>' +
        '<td class="num">' + count + '</td>' +
        '<td>' + (o.bank && o.account_number ? '<div class="tiny">' + esc(o.bank) + '</div><div class="dim tiny">' + esc(o.account_number) + '</div>' : '<span class="dim">—</span>') + '</td>' +
        (canManage ? '<td><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-pms-edit="owner:' + o.id + '">' + icon("edit", 13) + '</button><button class="btn btn-danger btn-sm" data-pms-archive="owner:' + o.id + '">' + icon("archive", 13) + '</button></div></td>' : "") +
        '</tr>';
    });
    h += '</table></div>';
    return h;
  }

  function pmsListTenants() {
    const q = String(state.pmsQuery || "").toLowerCase();
    let list = pmsActiveTenants();
    if (q) list = list.filter(t => (t.name + " " + t.email + " " + t.phone + " " + t.employment).toLowerCase().indexOf(q) !== -1);
    if (!list.length) return pmsEmpty("No tenants match", "Adjust your search or add a new tenant.");
    const canManage = pmsCan("manage");
    let h = '<div class="table-wrap"><table class="data"><tr><th>Tenant</th><th>Contact</th><th>Employment</th><th class="num">Active Leases</th><th class="num">Outstanding</th>' + (canManage ? "<th>Actions</th>" : "") + '</tr>';
    list.forEach(t => {
      const leases = pmsActiveLeases().filter(l => l.tenant_id === t.id);
      const active = leases.filter(l => l.status === "active");
      const out = pmsArrearsFor(leases);
      const accountStatus = t.accountStatus || (t.authUserId ? "pending" : "");
      h += '<tr><td><b>' + esc(t.name || "—") + '</b>' + (accountStatus ? '<div class="mt-8"><span class="badge ' + (accountStatus === "approved" ? "green" : accountStatus === "rejected" ? "red" : "gold") + '">User: ' + esc(accountStatus) + '</span></div>' : "") + '</td>' +
        '<td>' + (t.email ? '<div>' + esc(t.email) + '</div>' : "") + (t.phone ? '<div class="dim tiny">' + esc(t.phone) + '</div>' : "") + '</td>' +
        '<td>' + esc(t.employment || "—") + '</td>' +
        '<td class="num">' + active.length + '</td>' +
        '<td class="num">' + (out > 0 ? '<span class="badge red">' + C.money(out) + '</span>' : "—") + '</td>' +
        (canManage ? '<td><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-pms-edit="tenant:' + t.id + '">' + icon("edit", 13) + '</button><button class="btn btn-danger btn-sm" data-pms-archive="tenant:' + t.id + '">' + icon("archive", 13) + '</button></div></td>' : "") +
        '</tr>';
    });
    h += '</table></div>';
    return h;
  }

  function pmsListLeases() {
    const q = String(state.pmsQuery || "").toLowerCase();
    const sf = state.pmsStatusFilter || "";
    const pf = state.pmsPropertyFilter || "";
    let list = pmsActiveLeases();
    if (sf) list = list.filter(l => l.status === sf);
    if (pf) list = list.filter(l => l.property_id === pf);
    if (q) list = list.filter(l => pmsLeaseLabel(l).toLowerCase().indexOf(q) !== -1);
    if (!list.length) return pmsEmpty("No leases match", "Adjust your filters or add a new lease.");
    const canManage = pmsCan("manage");
    let h = '<div class="table-wrap"><table class="data"><tr><th>Property / Unit</th><th>Tenant</th><th class="num">Rent</th><th class="num">Deposit</th><th class="num">Due Date</th><th>Term</th><th>Status</th>' + (canManage ? "<th>Actions</th>" : "") + '</tr>';
    list.forEach(l => {
      const sc = LEASE_STATUSES.find(x => x.value === l.status);
      const due = (l.status === "active" || l.status === "expiring") ? pmsLeaseDueInfo(l) : null;
      const dueNote = due ? (due.state === "paid" ? "paid" : (due.state === "overdue" ? "overdue" : "due")) : "";
      const dueBadge = due && due.state !== "paid"
        ? '<div class="mt-8">' + (due.state === "overdue" ? pmsStatusBadge({ color: "red" }, "Payment overdue") : pmsStatusBadge({ color: "gold" }, "Payment due")) + '</div>'
        : (due ? '<div class="mt-8">' + pmsStatusBadge({ color: "green" }, "Paid") + '</div>' : "");
      h += '<tr><td><b>' + esc(pmsPropertyTitle(l.property_id)) + '</b><div class="dim tiny">' + esc(pmsUnitName(l.unit_id)) + '</div></td>' +
        '<td>' + esc(pmsTenantName(l.tenant_id)) + '</td>' +
        '<td class="num">' + (C.num(l.rent, 0) > 0 ? C.money(l.rent) : "—") + (l.rent_type === "lease" ? '<div class="dim tiny">lease \u00B7 total</div>' : '<div class="dim tiny">per month</div>') + '</td>' +
        '<td class="num">' + (C.num(l.deposit, 0) > 0 ? C.money(l.deposit) : "—") + '</td>' +
        '<td class="num">' + (due ? '<b>' + esc(pmsDispDate(due.nextDue)) + '</b>' + (dueNote ? '<div class="dim tiny">' + esc(dueNote) + '</div>' : "") : "—") + '</td>' +
        '<td>' + (l.start ? esc(String(l.start).slice(0, 10)) : "—") + ' \u2192 ' + (l.end ? esc(String(l.end).slice(0, 10)) : "—") + '</td>' +
        '<td>' + pmsStatusBadge(sc, sc ? sc.label : (l.status || "—")) + dueBadge + '</td>' +
        (canManage ? '<td><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-pms-paylink="' + l.id + '" title="View payments">' + icon("dollar", 13) + '</button><button class="btn btn-ghost btn-sm" data-pms-print="lease:' + l.id + '" title="Printable payable list">' + icon("print", 13) + '</button><button class="btn btn-ghost btn-sm" data-pms-edit="lease:' + l.id + '">' + icon("edit", 13) + '</button><button class="btn btn-danger btn-sm" data-pms-archive="lease:' + l.id + '">' + icon("archive", 13) + '</button></div></td>' : "") +
        '</tr>';
    });
    h += '</table></div>';
    return h;
  }

  function pmsListPayments() {
    const q = String(state.pmsQuery || "").toLowerCase();
    const sf = state.pmsStatusFilter || "";
    const pf = state.pmsPropertyFilter || "";
    const lf = state.pmsLeaseFilter || "";
    let list = pmsActivePayments();
    pmsActiveLeases().forEach(l => {
      if ((l.status !== "active" && l.status !== "expiring") || l.rent_type === "lease") return;
      pmsUnpaidMonths(l).forEach(u => {
        list.push({
          id: "due-" + l.id + "-" + u.label.replace(/[^a-z0-9]/gi, ""),
          lease_id: l.id,
          property_id: l.property_id,
          unit_id: l.unit_id,
          tenant_id: l.tenant_id,
          amount: C.num(l.rent, 0),
          date: u.date.toISOString().slice(0, 10),
          month: u.label,
          method: "",
          status: "due",
          notes: "",
          synthetic: true,
          createdAt: 0,
          archived: false
        });
      });
    });
    list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    if (sf) list = list.filter(p => p.status === sf);
    if (pf) list = list.filter(p => p.property_id === pf);
    if (lf) list = list.filter(p => p.lease_id === lf);
    if (q) list = list.filter(p => (pmsLeaseLabel(pms().leases.find(l => l.id === p.lease_id)) + " " + p.month + " " + p.method + " " + p.amount).toLowerCase().indexOf(q) !== -1);
    if (!list.length) return pmsEmpty("No payments match", "Adjust your filters or record a payment.");
    const canManage = pmsCan("manage");
    const paid = pmsPaySum(list, ["paid"]), pending = pmsPaySum(list, ["pending"]), late = pmsPaySum(list, ["late"]), due = pmsPaySum(list, ["due"]);
    let banner = "";
    if (lf) {
      const lease = pms().leases.find(x => x.id === lf);
      banner = '<div class="row" style="gap:8px;align-items:center;margin-bottom:10px"><span class="dim">Payments for <b>' + esc(pmsLeaseLabel(lease)) + '</b></span><button class="btn btn-ghost btn-sm" data-pms-clear-lease>Clear</button></div>';
    }
    let h = banner + '<div class="table-wrap"><table class="data"><tr><th>Date</th><th>Tenant / Lease</th><th>Period</th><th class="num">Amount</th><th>Method</th><th>Status</th><th>Proof</th>' + (canManage ? "<th>Actions</th>" : "") + '</tr>';
    list.forEach(p => {
      const sc = PAYMENT_STATUSES.find(x => x.value === p.status);
      const proof = safePaymentProofUrl(p.proof);
      h += '<tr><td>' + esc(String(p.date || "").slice(0, 10)) + '</td>' +
        '<td>' + esc(pmsLeaseLabel(pms().leases.find(l => l.id === p.lease_id))) + '</td>' +
        '<td>' + esc(p.month || "—") + '</td>' +
        '<td class="num">' + C.money(p.amount) + '</td>' +
        '<td>' + esc(p.method || "—") + '</td>' +
        '<td>' + pmsStatusBadge(sc, sc ? sc.label : (p.status || "—")) + '</td>' +
        '<td>' + (proof
          ? '<a href="' + esc(proof) + '" target="_blank" rel="noopener" title="' + esc(p.proofName || "View proof") + '"><img src="' + esc(proof) + '" alt="proof" style="width:44px;height:32px;object-fit:cover;border-radius:6px;border:1px solid var(--stroke)"></a>'
          : '<span class="dim">—</span>') + '</td>' +
        (canManage ? '<td><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-pms-email-payment="' + esc(p.id) + '" data-lease-id="' + esc(p.lease_id || "") + '" data-payment-amount="' + esc(String(p.amount || 0)) + '" data-payment-date="' + esc(p.date || "") + '" data-payment-month="' + esc(p.month || "") + '" data-payment-status="' + esc(p.status || "") + '" data-payment-method="' + esc(p.method || "") + '" title="Send payment details to tenant">' + icon("mail", 13) + ' Email</button>' + (!p.synthetic ? '<button class="btn btn-ghost btn-sm" data-pms-edit="payment:' + p.id + '">' + icon("edit", 13) + '</button><button class="btn btn-danger btn-sm" data-pms-archive="payment:' + p.id + '">' + icon("archive", 13) + '</button>' : "") + '</div></td>' : "") +
        '</tr>';
    });
    h += '</table></div>';
    h += '<div class="row mt-16" style="gap:8px;flex-wrap:wrap">' +
      (due > 0 ? '<span class="badge gold">Due ' + C.money(due) + '</span>' : "") +
      '<span class="badge green">Paid ' + C.money(paid) + '</span>' +
      '<span class="badge gold">Pending ' + C.money(pending) + '</span>' +
      '<span class="badge red">Late ' + C.money(late) + '</span></div>';
    return h;
  }

  function pmsListMaintenance() {
    const q = String(state.pmsQuery || "").toLowerCase();
    const sf = state.pmsStatusFilter || "";
    const pf = state.pmsPropertyFilter || "";
    const xf = state.pmsExtraFilter || "";
    let list = pmsActiveMaintenance();
    if (sf) list = list.filter(m => m.status === sf);
    if (pf) list = list.filter(m => m.property_id === pf);
    if (xf) list = list.filter(m => m.priority === xf);
    if (q) list = list.filter(m => (m.title + " " + m.vendor + " " + m.category + " " + pmsPropertyTitle(m.property_id) + " " + pmsUnitName(m.unit_id)).toLowerCase().indexOf(q) !== -1);
    if (!list.length) return pmsEmpty("No work orders match", "Adjust your filters or create a work order.");
    const canManage = pmsCan("manage");
    let h = '<div class="table-wrap"><table class="data"><tr><th>Date</th><th>Work Order</th><th>Property / Unit</th><th>Priority</th><th>Status</th><th class="num">Cost</th>' + (canManage ? "<th>Actions</th>" : "") + '</tr>';
    list.forEach(m => {
      const sc = MAINT_STATUSES.find(x => x.value === m.status);
      const pc = MAINT_PRIORITIES.find(x => x[0] === m.priority);
      h += '<tr><td>' + esc(String(m.date || "").slice(0, 10)) + '</td>' +
        '<td><b>' + esc(m.title || "—") + '</b>' + (m.category ? '<div class="dim tiny">' + esc(m.category) + (m.vendor ? " \u00B7 " + esc(m.vendor) : "") + '</div>' : "") + '</td>' +
        '<td>' + esc(pmsPropertyTitle(m.property_id)) + (m.unit_id ? '<div class="dim tiny">' + esc(pmsUnitName(m.unit_id)) + '</div>' : "") + '</td>' +
        '<td>' + pmsStatusBadge(pc ? { color: m.priority === "high" ? "red" : m.priority === "medium" ? "gold" : "blue" } : null, pc ? pc[1] : (m.priority || "—")) + '</td>' +
        '<td>' + pmsStatusBadge(sc, sc ? sc.label : (m.status || "—")) + '</td>' +
        '<td class="num">' + (C.num(m.cost, 0) > 0 ? C.money(m.cost) : "—") + '</td>' +
        (canManage ? '<td><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-pms-edit="maintenance:' + m.id + '">' + icon("edit", 13) + '</button><button class="btn btn-danger btn-sm" data-pms-archive="maintenance:' + m.id + '">' + icon("archive", 13) + '</button></div></td>' : "") +
        '</tr>';
    });
    h += '</table></div>';
    return h;
  }

  function pmsListExpenses() {
    const q = String(state.pmsQuery || "").toLowerCase();
    const pf = state.pmsPropertyFilter || "";
    const xf = state.pmsExtraFilter || "";
    let list = pmsActiveExpenses();
    if (pf) list = list.filter(e => e.property_id === pf);
    if (xf) list = list.filter(e => e.category === xf);
    if (q) list = list.filter(e => (e.description + " " + e.category + " " + pmsPropertyTitle(e.property_id)).toLowerCase().indexOf(q) !== -1);
    if (!list.length) return pmsEmpty("No expenses match", "Adjust your filters or record an expense.");
    const canManage = pmsCan("manage");
    const total = list.reduce((s, e) => s + C.num(e.amount, 0), 0);
    let h = '<div class="table-wrap"><table class="data"><tr><th>Date</th><th>Property</th><th>Category</th><th class="num">Amount</th><th>Description</th>' + (canManage ? "<th>Actions</th>" : "") + '</tr>';
    list.forEach(e => {
      h += '<tr><td>' + esc(String(e.date || "").slice(0, 10)) + '</td>' +
        '<td>' + esc(pmsPropertyTitle(e.property_id)) + '</td>' +
        '<td>' + esc(e.category || "—") + '</td>' +
        '<td class="num">' + C.money(e.amount) + '</td>' +
        '<td>' + esc(e.description || "") + '</td>' +
        (canManage ? '<td><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-pms-edit="expense:' + e.id + '">' + icon("edit", 13) + '</button><button class="btn btn-danger btn-sm" data-pms-archive="expense:' + e.id + '">' + icon("archive", 13) + '</button></div></td>' : "") +
        '</tr>';
    });
    h += '</table></div>';
    h += '<div class="row mt-16" style="gap:8px;flex-wrap:wrap"><span class="badge red">Total ' + C.money(total) + '</span></div>';
    return h;
  }

  function pmsListDocuments() {
    const q = String(state.pmsQuery || "").toLowerCase();
    const pf = state.pmsPropertyFilter || "";
    const xf = state.pmsExtraFilter || "";
    let list = pmsActiveDocuments();
    if (pf) list = list.filter(d => d.property_id === pf);
    if (xf) list = list.filter(d => d.category === xf);
    if (q) list = list.filter(d => (d.name + " " + d.type + " " + d.category + " " + d.notes + " " + pmsPropertyTitle(d.property_id)).toLowerCase().indexOf(q) !== -1);
    if (!list.length) return pmsEmpty("No documents match", "Adjust your filters or add a document entry.");
    const canManage = pmsCan("manage");
    let h = '<div class="table-wrap"><table class="data"><tr><th>Name</th><th>Type</th><th>Category</th><th>Property / Unit</th><th class="num">Date</th><th>Notes</th>' + (canManage ? "<th>Actions</th>" : "") + '</tr>';
    list.forEach(d => {
      h += '<tr><td><b>' + esc(d.name || "—") + '</b></td>' +
        '<td>' + esc(d.type || "—") + '</td>' +
        '<td>' + esc(d.category || "—") + '</td>' +
        '<td>' + esc(pmsPropertyTitle(d.property_id)) + (d.unit_id ? '<div class="dim tiny">' + esc(pmsUnitName(d.unit_id)) + '</div>' : "") + '</td>' +
        '<td class="num">' + esc(String(d.date || "").slice(0, 10)) + '</td>' +
        '<td>' + esc(d.notes || "") + '</td>' +
        (canManage ? '<td><div class="row" style="gap:6px"><button class="btn btn-ghost btn-sm" data-pms-edit="document:' + d.id + '">' + icon("edit", 13) + '</button><button class="btn btn-danger btn-sm" data-pms-archive="document:' + d.id + '">' + icon("archive", 13) + '</button></div></td>' : "") +
        '</tr>';
    });
    h += '</table></div>';
    return h;
  }

  async function loadPmsInsights() {
    if (state.pmsInsightsLoaded) return;
    state.pmsInsightsLoaded = true;
    if (!SB || !currentUser || !currentUser.id || currentUser.demo) { state.pmsInsights = null; return; }
    try {
      const r = await SB.rpc("pms_insights");
      if (r.error) throw r.error;
      state.pmsInsights = r.data || {};
      render();
    } catch (e) { toast("Could not load portfolio insights: " + esc(friendlyErr(e.message)), "err"); }
  }
  function pmsInsightsCard() {
    const d = state.pmsInsights;
    if (!d || !Object.keys(d).length) return "";
    const money = k => C.money(Number(d[k] || 0));
    const num = k => esc(String(d[k] != null ? d[k] : 0));
    let card = '<div class="card card-pad mb-24"><div class="row spread"><h3>Portfolio Insights</h3>' +
      '<button class="btn btn-ghost btn-sm" data-pi-refresh>' + icon("back", 13) + " Refresh</button></div>" +
      '<p class="dim tiny mt-8">Aggregated from normalized cloud tables' + (roleIs("super-admin") ? " across all workspaces." : ".") + "</p>" +
      '<div class="table-wrap"><table class="data"><tr><th>Properties</th><th>Units (occupied)</th><th>Active Leases</th><th>Collected</th><th>Arrears</th><th>Expenses</th><th>Open Maintenance</th><th>Documents</th></tr>' +
      "<tr><td>" + num("properties_total") + "</td><td>" + num("units_total") + " (" + num("units_occupied") + ")</td><td>" + num("leases_active") + "</td><td class=\"num\">" + money("collected") + "</td><td class=\"num\">" + money("arrears_pending") + "</td><td class=\"num\">" + money("expenses_total") + "</td><td>" + num("maintenance_open") + "</td><td>" + num("documents_total") + "</td></tr></table></div>";
    if (d.generated_at) card += '<p class="dim tiny mt-8">Updated ' + esc(String(d.generated_at).slice(0, 19).replace("T", " ")) + " UTC</p>";
    card += "</div>";
    return card;
  }

  function pmsReports() {
    loadPmsInsights();
    const props = pmsActiveProperties(), units = pmsActiveUnits(), leases = pmsActiveLeases(),
      payments = pmsActivePayments(), expenses = pmsActiveExpenses();
    const occupied = units.filter(u => u.status === "occupied").length;
    const paid = pmsPaySum(payments, ["paid"]);
    const arrears = pmsArrearsFor(leases.filter(l => l.status === "active"));
    const totalExp = expenses.reduce((s, e) => s + C.num(e.amount, 0), 0);
    const occPct = units.length ? Math.round(occupied / units.length * 100) : 0;
    let html = '<div class="grid grid-4 mb-24">' +
      kpi("Occupancy", occPct + "%", occupied + " of " + units.length + " units", occPct >= 80 ? "green" : occPct >= 50 ? "gold" : "red", "check") +
      kpi("Collected", C.money(paid), "all-time rent paid", "green", "dollar") +
      kpi("Arrears", C.money(arrears), "overdue rent", arrears > 0 ? "red" : "green", "trending") +
      kpi("Expenses", C.money(totalExp), "all-time operating", "gold", "briefcase") + '</div>';
    if (!props.length) {
      html += '<div class="card card-pad empty">' + icon("chart", 46) + "<h3>No data to report yet</h3><p>Add properties, leases, and payments to see occupancy and income reports.</p></div>";
      html = pmsInsightsCard() + html;
      return html;
    }
    html += '<div class="card card-pad mb-24"><h3 class="mb-16">Occupancy by Property</h3><div class="table-wrap"><table class="data"><tr><th>Property</th><th class="num">Units</th><th class="num">Occupied</th><th class="num">Vacant</th><th class="num">Occupancy</th></tr>';
    props.forEach(p => {
      const u = pmsActiveUnits().filter(x => x.property_id === p.id);
      const oc = u.filter(x => x.status === "occupied").length;
      const pct = u.length ? Math.round(oc / u.length * 100) : 0;
      html += '<tr><td>' + esc(p.title) + '</td><td class="num">' + u.length + '</td><td class="num">' + oc + '</td><td class="num">' + (u.length - oc) + '</td><td class="num">' + pct + '%</td></tr>';
    });
    html += '</table></div></div>';
    html += '<div class="card card-pad mb-24"><h3 class="mb-16">Income Summary by Property</h3><div class="table-wrap"><table class="data"><tr><th>Property</th><th class="num">Monthly Rent</th><th class="num">Collected</th><th class="num">Arrears</th><th class="num">Expenses</th><th class="num">Net</th></tr>';
    props.forEach(p => {
      const monthly = leases.filter(l => l.property_id === p.id && l.status === "active" && l.rent_type !== "lease").reduce((s, l) => s + C.num(l.rent, 0), 0);
      const coll = pmsPaySum(payments.filter(x => x.property_id === p.id), ["paid"]);
      const arr = pmsArrearsFor(leases.filter(x => x.property_id === p.id && x.status === "active"));
      const ex = expenses.filter(x => x.property_id === p.id).reduce((s, e) => s + C.num(e.amount, 0), 0);
      html += '<tr><td>' + esc(p.title) + '</td><td class="num">' + C.money(monthly) + '</td><td class="num">' + C.money(coll) + '</td><td class="num">' + C.money(arr) + '</td><td class="num">' + C.money(ex) + '</td><td class="num"><b>' + C.money(coll - ex) + '</b></td></tr>';
    });
    html += '</table></div></div>';
    html += '<div class="card card-pad mb-24"><h3 class="mb-16">Property Reports</h3><div class="table-wrap"><table class="data"><tr><th>Property</th><th class="num">Units</th><th class="num">Active Leases</th><th class="num">Collected</th><th class="num">Arrears</th><th>Actions</th></tr>';
    props.forEach(p => {
      const u = pmsActiveUnits().filter(x => x.property_id === p.id);
      const lc = pmsActiveLeases().filter(x => x.property_id === p.id && (x.status === "active" || x.status === "expiring"));
      const pc = pmsPaySum(pmsActivePayments().filter(x => x.property_id === p.id), ["paid"]);
      const ac = pmsArrearsFor(pmsActiveLeases().filter(x => x.property_id === p.id && x.status === "active"));
      html += '<tr><td>' + esc(p.title) + '</td><td class="num">' + u.length + '</td><td class="num">' + lc.length + '</td><td class="num">' + C.money(pc) + '</td><td class="num">' + C.money(ac) + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" data-pms-printrep="property:' + p.id + '">' + icon("print", 13) + " Print Report</button></td></tr>";
    });
    html += '</table></div></div>';
    html += '<div class="row" style="gap:10px">' +
      '<button class="btn btn-ghost btn-sm" data-pms-export="occupancy">' + icon("download", 13) + " Export Occupancy CSV</button>" +
      '<button class="btn btn-ghost btn-sm" data-pms-export="income">' + icon("download", 13) + " Export Income CSV</button>" +
      '</div>';
    return html;
  }

  function pmsReportsCSV(kind) {
    const escCsv = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    let rows;
    if (kind === "occupancy") {
      rows = [["Property", "Units", "Occupied", "Vacant", "Occupancy %"]];
      pmsActiveProperties().forEach(p => {
        const u = pmsActiveUnits().filter(x => x.property_id === p.id);
        const oc = u.filter(x => x.status === "occupied").length;
        rows.push([p.title, u.length, oc, u.length - oc, u.length ? Math.round(oc / u.length * 100) : 0]);
      });
    } else {
      rows = [["Property", "Monthly Rent", "Collected", "Arrears", "Expenses", "Net"]];
      pmsActiveProperties().forEach(p => {
        const monthly = pmsActiveLeases().filter(l => l.property_id === p.id && l.status === "active" && l.rent_type !== "lease").reduce((s, l) => s + C.num(l.rent, 0), 0);
        const coll = pmsPaySum(pmsActivePayments().filter(x => x.property_id === p.id), ["paid"]);
        const arr = pmsArrearsFor(pmsActiveLeases().filter(x => x.property_id === p.id && x.status === "active"));
        const ex = pmsActiveExpenses().filter(x => x.property_id === p.id).reduce((s, e) => s + C.num(e.amount, 0), 0);
        rows.push([p.title, monthly, coll, arr, ex, coll - ex]);
      });
    }
    const csv = rows.map(r => r.map(escCsv).join(",")).join("\n");
    try {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "esrealty-pms-" + kind + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast("Export unavailable in this browser", "err"); }
  }

  function pmsTenantPortal() {
    const em = currentUser ? String(currentUser.email || "").toLowerCase() : "";
    const tenant = pmsActiveTenants().find(t => String(t.email || "").toLowerCase() === em);
    let html = '<div class="hero"><div><h1>Tenant Portal</h1><p>Your lease, rent, and payment history.</p></div></div>';
    if (!tenant) {
      html += '<div class="card card-pad empty">' + icon("home", 46) + "<h3>No tenant record for your account</h3><p>This demo account isn't linked to a tenant yet. Log in as Admin and create a tenant whose email matches <b>" + esc(currentUser ? currentUser.email : "your email") + '</b>, then switch back here.</p></div>';
      return html;
    }
    const leases = pmsActiveLeases().filter(l => l.tenant_id === tenant.id);
    const payIds = leases.map(l => l.id);
    const payments = pmsActivePayments().filter(p => payIds.indexOf(p.lease_id) !== -1);
    const active = leases.filter(l => l.status === "active");
    const due = pmsArrearsFor(leases);
    const paid = pmsPaySum(payments, ["paid"]);
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Active Leases", active.length, "of " + leases.length + " leases", "green", "doc") +
      kpi("Rent Due", C.money(due), "overdue rent", due > 0 ? "red" : "green", "dollar") +
      kpi("Paid", C.money(paid), "all-time", "green", "check") +
      kpi("Tenant", esc(tenant.name || "—").slice(0, 18), esc(tenant.phone || ""), "blue", "star") + '</div>';
    html += '<div class="card card-pad mb-24"><h3 class="mb-16">Your Leases</h3>';
    if (!leases.length) {
      html += '<p class="dim">No leases on file for your account.</p>';
    } else {
      leases.forEach(l => {
        const sc = LEASE_STATUSES.find(x => x.value === l.status);
        const ow = pms().owners.find(o => o.id === (tenant.owner_id || pms().properties.find(p => p.id === l.property_id)?.owner_id));
        const dinfo = pmsLeaseDueInfo(l);
        const dueColor = dinfo.state === "paid" ? "#34C77B" : (dinfo.state === "overdue" ? "#E5484D" : "#E9A23B");
        const dueTxt = dinfo.state === "paid" ? "Paid for " + dinfo.label : (dinfo.state === "overdue" ? "Due " + pmsDispDate(dinfo.nextDue) + " \u00B7 overdue" : "Due " + pmsDispDate(dinfo.nextDue));
        html += '<div class="appr-list-row" style="margin-bottom:10px"><div class="row spread" style="flex-wrap:wrap;gap:8px"><div><b>' + esc(pmsPropertyTitle(l.property_id)) + '</b><div class="dim tiny">' + esc(pmsUnitName(l.unit_id)) + (ow ? ' \u00B7 Landlord: <b>' + esc(ow.name) + '</b>' : "") + '</div></div>' +
          '<div style="text-align:right"><div class="k-value" style="font-size:16px">' + C.money(l.rent) + (l.rent_type === "lease" ? "" : "/mo") + '</div><div class="dim tiny">' + esc(String(l.start || "").slice(0, 10)) + ' \u2192 ' + esc(String(l.end || "").slice(0, 10)) + '</div>' +
          '<div class="mt-4" style="color:' + dueColor + ';font-size:18px;font-weight:700">' + dueTxt + '</div></div></div>' +
          '<div class="mt-8">' + pmsStatusBadge(sc, sc ? sc.label : (l.status || "—")) + '</div></div>';
      });
    }
    html += '</div>';
    html += '<div class="card card-pad"><h3 class="mb-16">Payment History</h3>';
    if (!payments.length) {
      html += '<p class="dim">No payments recorded for your account.</p>';
    } else {
      html += '<div class="table-wrap"><table class="data"><tr><th>Date</th><th>Period</th><th class="num">Amount</th><th>Method</th><th>Status</th><th>Proof</th></tr>';
      payments.forEach(p => {
        const sc = PAYMENT_STATUSES.find(x => x.value === p.status);
        const proof = safePaymentProofUrl(p.proof);
        html += '<tr><td>' + esc(String(p.date || "").slice(0, 10)) + '</td><td>' + esc(p.month || "—") + '</td><td class="num">' + C.money(p.amount) + '</td><td>' + esc(p.method || "—") + '</td><td>' + pmsStatusBadge(sc, sc ? sc.label : (p.status || "—")) + '</td>' +
          '<td>' + (proof
            ? '<a href="' + esc(proof) + '" target="_blank" rel="noopener" title="' + esc(p.proofName || "View proof") + '"><img src="' + esc(proof) + '" alt="proof" style="width:44px;height:32px;object-fit:cover;border-radius:6px;border:1px solid var(--stroke)"></a>'
            : '<span class="dim">—</span>') + '</td></tr>';
      });
      html += '</table></div>';
    }
    html += '</div>';
    return html;
  }

  function pmsOwnerPortal() {
    const em = currentUser ? String(currentUser.email || "").toLowerCase() : "";
    const owner = pmsActiveOwners().find(o => String(o.email || "").toLowerCase() === em);
    let html = '<div class="hero"><div><h1>Owner Portal</h1><p>Your properties, tenants, leases, and finances at a glance.</p></div></div>';
    if (!owner) {
      html += '<div class="card card-pad empty">' + icon("star", 46) + "<h3>No owner record for your account</h3><p>This demo account isn't linked to an owner yet. Log in as Admin and create an owner whose email matches <b>" + esc(currentUser ? currentUser.email : "your email") + '</b>, then switch back here.</p></div>';
      return html;
    }
    const myProps = pmsActiveProperties().filter(p => p.owner_id === owner.id);
    const propIds = myProps.map(p => p.id);
    const units = pmsActiveUnits().filter(u => propIds.indexOf(u.property_id) !== -1);
    const leases = pmsActiveLeases().filter(l => propIds.indexOf(l.property_id) !== -1);
    const tenIds = leases.map(l => l.tenant_id);
    const tenants = pmsActiveTenants().filter(t => tenIds.indexOf(t.id) !== -1 || t.owner_id === owner.id);
    const payIds = leases.map(l => l.id);
    const payments = pmsActivePayments().filter(p => payIds.indexOf(p.lease_id) !== -1);
    const active = leases.filter(l => l.status === "active");
    const myExpenses = pmsActiveExpenses().filter(e => propIds.indexOf(e.property_id) !== -1);
    const myMaint = pmsActiveMaintenance().filter(m => propIds.indexOf(m.property_id) !== -1);
    const openMaint = myMaint.filter(m => m.status !== "completed");
    const openMaintCost = openMaint.reduce((s, m) => s + C.num(m.cost, 0), 0);
    const maintCost = myMaint.reduce((s, m) => s + C.num(m.cost, 0), 0);
    const expenseSum = myExpenses.reduce((s, e) => s + C.num(e.amount, 0), 0);
    const totalExpenses = expenseSum + maintCost;
    const myDocs = pmsActiveDocuments().filter(d => propIds.indexOf(d.property_id) !== -1);
    const due = pmsArrearsFor(leases);
    const paid = pmsPaySum(payments, ["paid"]);
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Properties", myProps.length, "owned by you", "green", "briefcase") +
      kpi("Units", units.length, "across your properties", "blue", "layers") +
      kpi("Tenants", tenants.length, "linked to your leases", "blue", "star") +
      kpi("Active Leases", active.length, "of " + leases.length + " leases", "green", "doc") + '</div>';
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Collected", C.money(paid), "all-time paid", "green", "dollar") +
      kpi("Arrears", C.money(due), "overdue rent", due > 0 ? "red" : "green", "trending") +
      kpi("Owner", esc(owner.name || "—").slice(0, 18), esc(owner.email || ""), "purple", "star") +
      kpi("Bank", esc(owner.bank || "—"), esc(owner.account_number || ""), "gold", "credit-card") + '</div>';
    const netPosition = paid - totalExpenses;
    html += '<div class="grid grid-4 mb-24">' +
      kpi("Total Expenses", C.money(totalExpenses), "operating + maintenance", totalExpenses > 0 ? "red" : "green", "dollar") +
      kpi("Open Work Orders", openMaint.length, openMaintCost > 0 ? C.money(openMaintCost) + " est. cost" : "none in progress", openMaint.length ? "gold" : "green", "layers") +
      kpi("Documents", myDocs.length, myDocs.length === 1 ? "document on file" : "documents on file", "blue", "doc") +
      kpi("Net Position", C.money(netPosition), "collected minus expenses", netPosition >= 0 ? "green" : "red", "trending") + '</div>';
    html += '<div class="card card-pad mb-24"><h3 class="mb-16">Your Properties</h3>';
    if (!myProps.length) {
      html += '<p class="dim">No properties on file for your account.</p>';
    } else {
      html += '<div class="table-wrap"><table class="data"><tr><th>Property</th><th>Location</th><th>Type</th><th>Status</th><th class="num">Rent</th><th class="num">Units</th></tr>';
      myProps.forEach(p => {
        const sc = PROPERTY_STATUSES.find(x => x.value === p.status);
        const ucount = pmsActiveUnits().filter(u => u.property_id === p.id).length;
        html += '<tr><td><b>' + esc(p.title || "Untitled") + '</b></td>' +
          '<td>' + esc([p.barangay, p.city, p.province].filter(Boolean).join(", ") || p.address || "—") + '</td>' +
          '<td>' + esc(p.type || "—") + '</td>' +
          '<td>' + pmsStatusBadge(sc, sc ? sc.label : (p.status || "—")) + '</td>' +
          '<td class="num">' + (C.num(p.rent, 0) > 0 ? C.money(p.rent) + '/mo' : "—") + '</td>' +
          '<td class="num">' + ucount + '</td></tr>';
      });
      html += '</table></div>';
    }
    html += '</div>';
    html += '<div class="card card-pad mb-24"><h3 class="mb-16">Your Leases</h3>';
    if (!leases.length) {
      html += '<p class="dim">No leases on your properties yet.</p>';
    } else {
      leases.forEach(l => {
        const sc = LEASE_STATUSES.find(x => x.value === l.status);
        html += '<div class="appr-list-row" style="margin-bottom:10px"><div class="row spread" style="flex-wrap:wrap;gap:8px"><div><b>' + esc(pmsPropertyTitle(l.property_id)) + '</b><div class="dim tiny">' + esc(pmsUnitName(l.unit_id)) + ' \u00B7 ' + esc(pmsTenantName(l.tenant_id)) + '</div></div>' +
          '<div style="text-align:right"><div class="k-value" style="font-size:16px">' + C.money(l.rent) + (l.rent_type === "lease" ? "" : "/mo") + '</div><div class="dim tiny">' + esc(String(l.start || "").slice(0, 10)) + ' \u2192 ' + esc(String(l.end || "").slice(0, 10)) + '</div></div></div>' +
          '<div class="mt-8">' + pmsStatusBadge(sc, sc ? sc.label : (l.status || "—")) + '</div></div>';
      });
    }
    html += '</div>';
    html += '<div class="card card-pad"><h3 class="mb-16">Payment History</h3>';
    if (!payments.length) {
      html += '<p class="dim">No payments recorded for your properties.</p>';
    } else {
      html += '<div class="table-wrap"><table class="data"><tr><th>Date</th><th>Period</th><th class="num">Amount</th><th>Method</th><th>Status</th><th>Proof</th></tr>';
      payments.forEach(p => {
        const sc = PAYMENT_STATUSES.find(x => x.value === p.status);
        const proof = safePaymentProofUrl(p.proof);
        html += '<tr><td>' + esc(String(p.date || "").slice(0, 10)) + '</td><td>' + esc(p.month || "—") + '</td><td class="num">' + C.money(p.amount) + '</td><td>' + esc(p.method || "—") + '</td><td>' + pmsStatusBadge(sc, sc ? sc.label : (p.status || "—")) + '</td>' +
          '<td>' + (proof
            ? '<a href="' + esc(proof) + '" target="_blank" rel="noopener" title="' + esc(p.proofName || "View proof") + '"><img src="' + esc(proof) + '" alt="proof" style="width:44px;height:32px;object-fit:cover;border-radius:6px;border:1px solid var(--stroke)"></a>'
            : '<span class="dim">—</span>') + '</td></tr>';
      });
      html += '</table></div>';
    }
    html += '</div>';
    const myExpensesSorted = myExpenses.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    html += '<div class="card card-pad mb-24"><h3 class="mb-16">Expense History</h3>';
    if (!myExpenses.length) {
      html += '<p class="dim">No expenses recorded for your properties.</p>';
    } else {
      html += '<div class="table-wrap"><table class="data"><tr><th>Date</th><th>Property</th><th>Category</th><th>Description</th><th class="num">Amount</th></tr>';
      myExpensesSorted.forEach(e => {
        html += '<tr><td>' + esc(String(e.date || "").slice(0, 10)) + '</td><td>' + esc(pmsPropertyTitle(e.property_id)) + '</td><td>' + esc(e.category || "-") + '</td><td>' + esc(e.description || "-") + '</td><td class="num">' + C.money(C.num(e.amount, 0)) + '</td></tr>';
      });
      html += '<tr><td colspan="4"><b>Total operating expenses</b></td><td class="num"><b>' + C.money(expenseSum) + "</b></td></tr>";
      html += '</table></div>';
    }
    html += '</div>';
    const myMaintSorted = myMaint.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    html += '<div class="card card-pad mb-24"><h3 class="mb-16">Maintenance</h3>';
    if (!myMaint.length) {
      html += '<p class="dim">No work orders on your properties yet.</p>';
    } else {
      html += '<div class="table-wrap"><table class="data"><tr><th>Date</th><th>Work Order</th><th>Property / Unit</th><th>Status</th><th class="num">Cost</th></tr>';
      myMaintSorted.forEach(m => {
        const sc = MAINT_STATUSES.find(x => x.value === m.status);
        html += '<tr><td>' + esc(String(m.date || "").slice(0, 10)) + '</td><td><b>' + esc(m.title || "-") + '</b>' + (m.vendor ? '<div class="dim tiny">' + esc(m.vendor) + '</div>' : "") + '</td><td>' + esc(pmsPropertyTitle(m.property_id)) + (m.unit_id ? ' <span class="dim tiny">' + esc(pmsUnitName(m.unit_id)) + '</span>' : "") + '</td><td>' + pmsStatusBadge(sc, sc ? sc.label : (m.status || "-")) + '</td><td class="num">' + (C.num(m.cost, 0) > 0 ? C.money(C.num(m.cost, 0)) : "-") + '</td></tr>';
      });
      html += '<tr><td colspan="4"><b>Total maintenance cost</b></td><td class="num"><b>' + C.money(maintCost) + "</b></td></tr>";
      html += '</table></div>';
    }
    html += '</div>';
    const myDocsSorted = myDocs.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    html += '<div class="card card-pad"><h3 class="mb-16">Documents</h3>';
    if (!myDocs.length) {
      html += '<p class="dim">No documents on file for your properties.</p>';
    } else {
      html += '<div class="table-wrap"><table class="data"><tr><th>Name</th><th>Type</th><th>Category</th><th>Property / Unit</th><th class="num">Date</th><th>Notes</th></tr>';
      myDocsSorted.forEach(d => {
        html += '<tr><td><b>' + esc(d.name || "-") + '</b></td><td>' + esc(d.type || "-") + '</td><td>' + esc(d.category || "-") + '</td><td>' + esc(pmsPropertyTitle(d.property_id)) + (d.unit_id ? ' <span class="dim tiny">' + esc(pmsUnitName(d.unit_id)) + '</span>' : "") + '</td><td class="num">' + esc(String(d.date || "").slice(0, 10)) + '</td><td>' + esc(d.notes || "") + '</td></tr>';
      });
      html += '</table></div>';
    }
    html += '</div>';
    return html;
  }

  /* ---- PMS editors & persistence ---- */
  function pmsTxt(id, value, ph) {
    return '<input class="input" id="' + id + '" type="text" value="' + esc(value == null ? "" : value) + '" placeholder="' + (ph || "") + '">';
  }
  function pmsNum(id, value) {
    return '<input class="input input-num" id="' + id + '" type="text" inputmode="decimal" autocomplete="off" value="' + (C.num(value, 0) > 0 ? C.fmtNum(value) : "") + '" placeholder="0">';
  }
  function pmsSel(id, options, selected) {
    return '<select class="input" id="' + id + '">' + options.map(o => '<option value="' + o[0] + '"' + (selected === o[0] ? " selected" : "") + '>' + esc(o[1]) + '</option>').join("") + '</select>';
  }
  function pmsField(label, inner, hint, full) {
    return '<div class="field' + (full ? " col-full" : "") + '"><label>' + label + '</label>' + inner + (hint ? '<div class="field-hint">' + hint + '</div>' : "") + '</div>';
  }
  function pmsModal(title, body, saveKind, editId) {
    closePmsModal();
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.id = "pms-modal";
    if (editId) ov.setAttribute("data-edit-id", editId);
    ov.innerHTML = '<div class="modal-card"><div class="modal-head"><h3>' + esc(title) + '</h3><button class="icon-btn" data-pms-cancel title="Close">&times;</button></div>' +
      '<div class="modal-body">' + body + '</div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" data-pms-cancel>Cancel</button><button class="btn btn-primary" data-pms-save="' + saveKind + '">' + icon("check", 15) + " Save</button></div></div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closePmsModal(); });
  }
  function closePmsModal() { const m = $("#pms-modal"); if (m) m.remove(); }

  function pmsPrintModal(title, body) {
    closePmsModal();
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.id = "pms-modal";
    ov.innerHTML = '<div class="modal-card"><div class="modal-head"><h3>' + esc(title) + '</h3><button class="icon-btn" data-pms-cancel title="Close">&times;</button></div>' +
      '<div class="modal-body">' + body + '</div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" data-pms-cancel>Close</button><button class="btn btn-primary" data-pms-doprint>' + icon("print", 15) + " Print</button></div></div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closePmsModal(); });
  }
  function pmsPrintPayable(id) {
    const l = pms().leases.find(x => x.id === id);
    if (!l) return;
    const p = pmsTenantPayable(l);
    const statusBadge = s => s === "paid" ? '<span class="badge green">Paid</span>' : s === "overdue" ? '<span class="badge red">Overdue</span>' : s === "partial" ? '<span class="badge gold">Partial</span>' : s === "due" ? '<span class="badge gold">Due</span>' : '<span class="badge blue">Upcoming</span>';
    const rows = p.rows.map(r =>
      '<tr><td>' + esc(r.label) + '</td><td class="num">' + (r.due ? esc(pmsDispDate(r.due)) : "—") + '</td><td class="num">' + C.money(r.amount) + '</td><td>' + statusBadge(r.status) + '</td></tr>'
    ).join("");
    const pays = pmsActivePayments().filter(x => x.lease_id === l.id).slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    const payRows = pays.map(pay => {
      const sc = PAYMENT_STATUSES.find(x => x.value === pay.status);
      return '<tr><td class="num">' + esc(String(pay.date || "—").slice(0, 10)) + '</td><td>' + esc(pay.month || "—") + '</td><td class="num">' + C.money(pay.amount) + '</td><td>' + esc(pay.method || "—") + '</td><td>' + pmsStatusBadge(sc, sc ? sc.label : (pay.status || "—")) + '</td><td>' + esc(pay.notes || "—") + '</td></tr>';
    }).join("");
    const body = '<div class="print-root" id="pms-print-root">' +
      '<div class="print-brand"><h1>Tenant Payable Statement</h1><div class="dim tiny">Generated ' + esc(pmsDispDate(new Date())) + '</div></div>' +
      '<div class="print-meta">' +
      '<div><b>Tenant:</b> ' + esc(pmsTenantName(l.tenant_id)) + '</div>' +
      '<div><b>Property / Unit:</b> ' + esc(pmsPropertyTitle(l.property_id)) + ' · ' + esc(pmsUnitName(l.unit_id)) + '</div>' +
      '<div><b>Term:</b> ' + esc(String(l.start || "").slice(0, 10)) + ' → ' + esc(String(l.end || "").slice(0, 10)) + '</div>' +
      '<div><b>Rent:</b> ' + (l.rent_type === "lease" ? "lease · total " + C.money(l.rent) : C.money(l.rent) + " / month") + ' · due on day ' + pmsDueDay(l) + '</div>' +
      '</div>' +
      '<h3>Payment Schedule</h3>' +
      '<table class="print-sched"><tr><th>Period</th><th>Due Date</th><th class="num">Amount</th><th>Status</th></tr>' + rows + '</table>' +
      '<h3>Payments Recorded</h3>' +
      '<table class="print-pays"><tr><th>Date</th><th>Period</th><th class="num">Amount</th><th>Method</th><th>Status</th><th>Notes</th></tr>' + (payRows || '<tr><td colspan="6">No payments recorded</td></tr>') + '</table>' +
      '<table class="print-sum"><tr><th>Total</th><th>Paid</th><th>Balance</th></tr>' +
      '<tr><td class="num">' + C.money(p.total) + '</td><td class="num">' + C.money(p.paidTotal) + '</td><td class="num"><b>' + C.money(p.total - p.paidTotal) + '</b></td></tr></table>' +
      '<div class="print-foot"><span>Prepared by ES Realty · Property Management System</span></div>' +
      '</div>';
    pmsPrintModal("Tenant Payable — " + pmsTenantName(l.tenant_id), body);
  }

  function pmsPrintPropertyReport(id) {
    const p = pms().properties.find(x => x.id === id);
    if (!p) return;
    const units = pmsActiveUnits().filter(u => u.property_id === p.id);
    const leases = pmsActiveLeases().filter(l => l.property_id === p.id);
    const pays = pmsActivePayments().filter(x => x.property_id === p.id).slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    const exps = pmsActiveExpenses().filter(x => x.property_id === p.id);
    const owner = pmsActiveOwners().find(o => o.id === p.owner_id);
    const psc = PROPERTY_STATUSES.find(x => x.value === p.status);
    const occ = units.filter(u => u.status === "occupied").length;
    const occPct = units.length ? Math.round(occ / units.length * 100) : 0;
    const monthly = leases.filter(l => l.status === "active" && l.rent_type !== "lease").reduce((s, l) => s + C.num(l.rent, 0), 0);
    const paid = pmsPaySum(pays, ["paid"]);
    const arr = pmsArrearsFor(pmsActiveLeases().filter(x => x.property_id === p.id && x.status === "active"));
    const totalExp = exps.reduce((s, e) => s + C.num(e.amount, 0), 0);

    const unitRows = units.map(u => {
      const usc = UNIT_STATUSES.find(x => x.value === u.status);
      const tenants = pmsUnitTenants(u.id).join(", ");
      return '<tr><td>' + esc(pmsUnitName(u.id)) + '</td><td class="num">' + Math.floor(C.num(u.bedrooms, 0)) + '</td><td class="num">' + C.num(u.size, 0) + ' sqm</td><td>' + pmsStatusBadge(usc, usc ? usc.label : (u.status || "—")) + '</td><td>' + esc(tenants || "—") + '</td></tr>';
    }).join("");

    const tenantRows = leases.map(l => {
      const lsc = LEASE_STATUSES.find(x => x.value === l.status);
      return '<tr><td><b>' + esc(pmsTenantName(l.tenant_id)) + '</b></td><td>' + esc(pmsUnitName(l.unit_id)) + '</td><td>' + esc(String(l.start || "—").slice(0, 10)) + ' → ' + esc(String(l.end || "—").slice(0, 10)) + '</td><td class="num">' + (C.num(l.rent, 0) > 0 ? C.money(l.rent) : "—") + (l.rent_type === "lease" ? ' <span class="dim tiny">lease</span>' : "") + '</td><td>' + pmsStatusBadge(lsc, lsc ? lsc.label : (l.status || "—")) + '</td></tr>';
    }).join("");

    const payRows = pays.map(pay => {
      const psc2 = PAYMENT_STATUSES.find(x => x.value === pay.status);
      return '<tr><td class="num">' + esc(String(pay.date || "—").slice(0, 10)) + '</td><td>' + esc(pay.month || "—") + '</td><td>' + esc(pmsTenantName(pay.tenant_id)) + '</td><td class="num">' + C.money(pay.amount) + '</td><td>' + esc(pay.method || "—") + '</td><td>' + pmsStatusBadge(psc2, psc2 ? psc2.label : (pay.status || "—")) + '</td><td>' + esc(pay.notes || "—") + '</td></tr>';
    }).join("");

    const loc = [p.address, p.barangay, p.city, p.province].filter(Boolean).join(", ");
    const body = '<div class="print-root" id="pms-print-root">' +
      '<div class="print-brand"><h1>Property Report</h1><div class="dim tiny">Generated ' + esc(pmsDispDate(new Date())) + '</div></div>' +
      '<div class="print-meta">' +
      '<div><b>Property:</b> ' + esc(p.title) + '</div>' +
      '<div><b>Type:</b> ' + esc(p.type || "—") + ' · <b>Status:</b> ' + (psc ? esc(psc.label) : esc(p.status || "—")) + '</div>' +
      '<div><b>Owner:</b> ' + esc(owner ? owner.name : "—") + '</div>' +
      '<div><b>Location:</b> ' + esc(loc || "—") + '</div>' +
      (p.amenities && p.amenities.length ? '<div><b>Amenities:</b> ' + esc(p.amenities.join(", ")) + '</div>' : "") +
      '</div>' +
      '<h3>Overview</h3>' +
      '<table class="print-sum"><tr><th>Units</th><th>Occupied</th><th>Occupancy</th><th>Monthly Rent</th><th>Collected</th><th>Arrears</th><th>Expenses</th><th>Net</th></tr>' +
      '<tr><td class="num">' + units.length + '</td><td class="num">' + occ + '</td><td class="num">' + occPct + '%</td><td class="num">' + C.money(monthly) + '</td><td class="num">' + C.money(paid) + '</td><td class="num">' + C.money(arr) + '</td><td class="num">' + C.money(totalExp) + '</td><td class="num"><b>' + C.money(paid - totalExp) + '</b></td></tr></table>' +
      '<h3>Units</h3>' +
      '<table class="print-sched"><tr><th>Unit</th><th class="num">Beds</th><th class="num">Size</th><th>Status</th><th>Tenants</th></tr>' + (unitRows || '<tr><td colspan="5">No units</td></tr>') + '</table>' +
      '<h3>Tenants</h3>' +
      '<table class="print-pays"><tr><th>Tenant</th><th>Unit</th><th>Lease Term</th><th class="num">Rent</th><th>Status</th></tr>' + (tenantRows || '<tr><td colspan="5">No tenants</td></tr>') + '</table>' +
      '<h3>Payments</h3>' +
      '<table class="print-pays"><tr><th>Date</th><th>Period</th><th>Tenant</th><th class="num">Amount</th><th>Method</th><th>Status</th><th>Notes</th></tr>' + (payRows || '<tr><td colspan="7">No payments</td></tr>') + '</table>' +
      '<div class="print-foot"><span>Prepared by ES Realty · Property Management System</span></div>' +
      '</div>';
    pmsPrintModal("Property Report — " + p.title, body);
  }

  function openPmsEditor(kind, id) {
    if (!pmsCan("manage")) { toast("You don't have permission to manage records", "err"); return; }
    if (kind === "property") return openPropEditor(id);
    if (kind === "unit") return openUnitEditor(id);
    if (kind === "owner") return openOwnerEditor(id);
    if (kind === "tenant") return openTenantEditor(id);
    if (kind === "lease") return openLeaseEditor(id);
    if (kind === "payment") return openPaymentEditor(id);
    if (kind === "maintenance") return openMaintEditor(id);
    if (kind === "expense") return openExpenseEditor(id);
    if (kind === "document") return openDocumentEditor(id);
  }

  function openPropEditor(id) {
    const d = id ? pms().properties.find(x => x.id === id) || {} : {};
    const owners = pmsActiveOwners();
    const ownerSel = owners.length
      ? pmsSel("pms-prop-owner", [["", "— none —"]].concat(owners.map(o => [o.id, o.name])), d.owner_id || "")
      : pmsSel("pms-prop-owner", [["", "— add an owner first —"]], "");
    let body = pmsField("Title *", pmsTxt("pms-prop-title", d.title, "e.g. Sunrise Residences Building A"), "", true) +
      pmsField("Type", pmsSel("pms-prop-type", PROPERTY_TYPES.map(t => [t.toLowerCase(), t]), d.type || "residential")) +
      pmsField("Status", pmsSel("pms-prop-status", PROPERTY_STATUSES.map(s => [s.value, s.label]), d.status || "for sale")) +
      pmsField("Owner", ownerSel) +
      pmsField("Price (\u20B1)", pmsNum("pms-prop-price", d.price)) +
      pmsField("Monthly Rent (\u20B1)", pmsNum("pms-prop-rent", d.rent)) +
      pmsField("Address", pmsTxt("pms-prop-address", d.address, "Street / building"), "", true) +
      pmsField("Barangay", pmsTxt("pms-prop-brgy", d.barangay)) +
      pmsField("City", pmsTxt("pms-prop-city", d.city)) +
      pmsField("Province", pmsTxt("pms-prop-prov", d.province)) +
      pmsField("Amenities", pmsTxt("pms-prop-amen", (d.amenities || []).join(", "), "comma-separated"), "e.g. parking, pool, elevator.", true) +
      pmsField("Description", '<textarea class="input" id="pms-prop-desc" rows="3" placeholder="Notes about the property">' + esc(d.description || "") + '</textarea>', "", true);
    pmsModal(id ? "Edit Property" : "New Property", body, "property", id);
  }

  function openUnitEditor(id) {
    const d = id ? pms().units.find(x => x.id === id) || {} : {};
    const props = pmsActiveProperties();
    if (!props.length) { toast("Add a property first before creating units", "err"); return; }
    let body = pmsField("Property *", pmsSel("pms-unit-prop", props.map(p => [p.id, p.title]), d.property_id || props[0].id), "", true) +
      pmsField("Unit Number *", pmsTxt("pms-unit-no", d.unit_number, "e.g. 2B")) +
      pmsField("Status", pmsSel("pms-unit-status", UNIT_STATUSES.map(s => [s.value, s.label]), d.status || "vacant")) +
      pmsField("Bedrooms", pmsNum("pms-unit-beds", d.bedrooms)) +
      pmsField("Bathrooms", pmsNum("pms-unit-baths", d.bathrooms)) +
      pmsField("Size (sqm)", pmsNum("pms-unit-size", d.size)) +
      pmsField("Monthly Rent (\u20B1)", pmsNum("pms-unit-rent", d.rent_amount)) +
      pmsField("Tenant Name", pmsTxt("pms-unit-tenant", d.tenant_name, "if occupied")) +
      pmsField("Notes", pmsTxt("pms-unit-notes", d.notes), "", true);
    pmsModal(id ? "Edit Unit" : "New Unit", body, "unit", id);
  }

  function openOwnerEditor(id) {
    const d = id ? pms().owners.find(x => x.id === id) || {} : {};
    let body = pmsField("Name *", pmsTxt("pms-own-name", d.name, "Full name"), "", true) +
      pmsField("Email *", pmsTxt("pms-own-email", d.email, "you@email.com"), d.authUserId ? "This email is linked to the owner's Users account and cannot be changed here." : "Creates a pending Users account with a one-time temporary password.") +
      pmsField("Phone", pmsTxt("pms-own-phone", d.phone, "+63 9xx xxx xxxx")) +
      pmsField("Company", pmsTxt("pms-own-company", d.company)) +
      pmsField("Bank", pmsTxt("pms-own-bank", d.bank)) +
      pmsField("Account Number", pmsTxt("pms-own-acct", d.account_number)) +
      pmsField("Account Name", pmsTxt("pms-own-acctname", d.account_name)) +
      pmsField("Notes", '<textarea class="input" id="pms-own-notes" rows="3" placeholder="Payout notes">' + esc(d.notes || "") + '</textarea>', "", true);
    pmsModal(id ? "Edit Owner" : "New Owner", body, "owner", id);
    const email = $("#pms-own-email");
    if (email && d.authUserId) email.disabled = true;
  }

  function pmsDate(id, value) {
    return '<input class="input" id="' + id + '" type="date" value="' + esc(value || "") + '">';
  }

  function openTenantEditor(id) {
    const d = id ? pms().tenants.find(x => x.id === id) || {} : {};
    const ownerOpts = pmsActiveOwners().map(o => [o.id, o.name + (o.company ? " — " + o.company : "")]);
    if (!ownerOpts.length) ownerOpts.push(["", "— No owners yet —"]);
    let body = pmsField("Name *", pmsTxt("pms-ten-name", d.name, "Full name"), "", true) +
      pmsField("Email *", pmsTxt("pms-ten-email", d.email, "you@email.com"), d.authUserId ? "This email is linked to the tenant's Users account and cannot be changed here." : "Creates a pending Users account with a one-time temporary password on the first lease.") +
      pmsField("Phone", pmsTxt("pms-ten-phone", d.phone, "+63 9xx xxx xxxx")) +
      pmsField("Employment", pmsTxt("pms-ten-emp", d.employment, "e.g. Accountant, Acme Corp")) +
      pmsField("Monthly Income (\u20B1)", pmsNum("pms-ten-income", d.monthly_income)) +
      pmsField("Owner", pmsSel("pms-ten-owner", ownerOpts, d.owner_id || ""), "The landlord this tenant rents from.") +
      pmsField("Notes", '<textarea class="input" id="pms-ten-notes" rows="3" placeholder="Reference, ID, guarantor, etc.">' + esc(d.notes || "") + '</textarea>', "", true);
    pmsModal(id ? "Edit Tenant" : "New Tenant", body, "tenant", id);
    const email = $("#pms-ten-email");
    if (email && d.authUserId) email.disabled = true;
  }

  function openLeaseEditor(id) {
    const d = id ? pms().leases.find(x => x.id === id) || {} : {};
    const units = pmsActiveUnits(), tenants = pmsActiveTenants();
    if (!units.length) { toast("Add a unit first before creating a lease", "err"); return; }
    if (!tenants.length) { toast("Add a tenant first before creating a lease", "err"); return; }
    const editUnit = d.unit_id || null;
    const defaultUnit = editUnit || (units.find(u => pmsUnitTenantCount(u.id) < pmsUnitCapacity(u)) || units[0]).id;
    const unitOpts = units.map(u => {
      const used = pmsUnitTenantCount(u.id), cap = pmsUnitCapacity(u);
      const full = used >= cap;
      const dis = full && editUnit !== u.id ? " disabled" : "";
      return '<option value="' + u.id + '"' + (defaultUnit === u.id ? " selected" : "") + dis + '>' + esc(pmsPropertyTitle(u.property_id) + " \u00B7 " + pmsUnitName(u.id) + " (" + used + "/" + cap + " beds)") + '</option>';
    }).join("");
    const unitSel = '<select class="input" id="pms-lease-unit">' + unitOpts + '</select>';
    const selUnit = pms().units.find(x => x.id === defaultUnit);
    const selProp = selUnit ? pms().properties.find(x => x.id === selUnit.property_id) : null;
    const defaultRent = C.num(d.rent, 0) > 0 ? d.rent : (selUnit ? (C.num(selUnit.rent_amount, 0) > 0 ? selUnit.rent_amount : (selProp ? C.num(selProp.rent, 0) : 0)) : 0);
    const rt = d.rent_type === "lease" ? "lease" : "monthly";
    let body = pmsField("Unit *", unitSel, "Max tenants = number of beds in the unit.", true) +
      pmsField("Tenant *", pmsSel("pms-lease-tenant", tenants.map(t => [t.id, t.name]), d.tenant_id || "")) +
      pmsField("Start Date", pmsDate("pms-lease-start", d.start)) +
      pmsField("End Date", pmsDate("pms-lease-end", d.end)) +
      pmsField("Payment Mode", pmsSel("pms-lease-rtype", [["monthly", "Monthly Rental"], ["lease", "Lease"]], rt)) +
      pmsField("Rent Due (day of month)", pmsNum("pms-lease-due", pmsDueDay(d)), "Deadline each month for the rent payment (1\u201328).") +
      '<div class="field col-full" id="pms-lease-rent-wrap"' + (rt === "lease" ? ' style="display:none"' : "") + '><label>Monthly Rent (\u20B1)</label>' + pmsNum("pms-lease-rent", defaultRent) + '<div class="field-hint">Collected every month.</div></div>' +
      '<div class="field col-full" id="pms-lease-total-wrap"' + (rt === "lease" ? "" : ' style="display:none"') + '><label>Lease Amount / Total (\u20B1)</label>' + pmsNum("pms-lease-total", rt === "lease" ? d.rent : 0) + '<div class="field-hint">Total payable over the lease term.</div></div>' +
      pmsField("Security Deposit (\u20B1)", pmsNum("pms-lease-dep", d.deposit)) +
      pmsField("Status", pmsSel("pms-lease-status", LEASE_STATUSES.map(s => [s.value, s.label]), d.status || "active")) +
      pmsField("Notes", pmsTxt("pms-lease-notes", d.notes), "", true);
    pmsModal(id ? "Edit Lease" : "New Lease", body, "lease", id);
    const rtSel = $("#pms-lease-rtype");
    if (rtSel) rtSel.addEventListener("change", () => {
      const isLease = rtSel.value === "lease";
      const rw = $("#pms-lease-rent-wrap"), tw = $("#pms-lease-total-wrap");
      if (rw) rw.style.display = isLease ? "none" : "";
      if (tw) tw.style.display = isLease ? "" : "none";
    });
  }

  function openPaymentEditor(id) {
    const d = id ? pms().payments.find(x => x.id === id) || {} : {};
    const proof = safePaymentProofUrl(d.proof);
    const leases = pmsActiveLeases();
    if (!leases.length) { toast("Add a lease first before recording a payment", "err"); return; }
    let body = pmsField("Lease *", pmsSel("pms-pay-lease", leases.map(l => [l.id, pmsLeaseLabel(l)]), d.lease_id || leases[0].id), "", true) +
      pmsField("Amount (\u20B1)", pmsNum("pms-pay-amount", d.amount)) +
      pmsField("Payment Date", pmsDate("pms-pay-date", d.date || new Date().toISOString().slice(0, 10))) +
      pmsField("Period (month)", pmsSel("pms-pay-month", pmsMonthOptions(d.month), d.month || pmsMonthLabel(new Date()))) +
      pmsField("Method", pmsSel("pms-pay-method", PAYMENT_METHODS.map(m => [m, m]), d.method || "Cash")) +
      pmsField("Status", pmsSel("pms-pay-status", PAYMENT_STATUSES.map(s => [s.value, s.label]), d.status || "paid")) +
      pmsField("Notes", pmsTxt("pms-pay-notes", d.notes), "", true) +
      '<div class="field col-full"><label>Proof of Payment</label>' +
      '<label class="btn btn-ghost btn-sm" style="margin:0">' + icon("upload", 14) + ' Choose image<input type="file" id="pms-pay-proof" style="display:none" accept="image/*"></label>' +
      (proof ? '<div class="mt-8"><a href="' + esc(proof) + '" target="_blank" rel="noopener"><img src="' + esc(proof) + '" alt="proof" style="max-width:100%;max-height:120px;border-radius:8px;border:1px solid var(--stroke)"></a></div>' : "") +
      '<div class="field-hint">Attach a photo or screenshot of the receipt (GCash, bank transfer, etc.). Stored locally and compressed.</div></div>';
    pmsModal(id ? "Edit Payment" : "New Payment", body, "payment", id);
  }

  function openMaintEditor(id) {
    const d = id ? pms().maintenance.find(x => x.id === id) || {} : {};
    const units = pmsActiveUnits();
    let unitSel = pmsSel("pms-maint-unit", [["", "— none —"]].concat(units.map(u => [u.id, pmsPropertyTitle(u.property_id) + " \u00B7 " + pmsUnitName(u.id)])), d.unit_id || "");
    let body = pmsField("Title *", pmsTxt("pms-maint-title", d.title, "e.g. Leaking faucet"), "", true) +
      pmsField("Unit", unitSel) +
      pmsField("Category", pmsSel("pms-maint-cat", MAINT_CATEGORIES.map(c => [c, c]), d.category || "General Repair")) +
      pmsField("Priority", pmsSel("pms-maint-pri", MAINT_PRIORITIES, d.priority || "medium")) +
      pmsField("Status", pmsSel("pms-maint-status", MAINT_STATUSES.map(s => [s.value, s.label]), d.status || "open")) +
      pmsField("Cost (\u20B1)", pmsNum("pms-maint-cost", d.cost)) +
      pmsField("Vendor", pmsTxt("pms-maint-vendor", d.vendor, "contractor / supplier")) +
      pmsField("Date", pmsDate("pms-maint-date", d.date)) +
      pmsField("Notes", '<textarea class="input" id="pms-maint-notes" rows="3">' + esc(d.notes || "") + '</textarea>', "", true);
    pmsModal(id ? "Edit Work Order" : "New Work Order", body, "maintenance", id);
  }

  function openExpenseEditor(id) {
    const d = id ? pms().expenses.find(x => x.id === id) || {} : {};
    const props = pmsActiveProperties();
    let propSel = props.length
      ? pmsSel("pms-exp-prop", [["", "— none —"]].concat(props.map(p => [p.id, p.title])), d.property_id || "")
      : pmsSel("pms-exp-prop", [["", "— add a property first —"]], "");
    let body = pmsField("Property", propSel) +
      pmsField("Category", pmsSel("pms-exp-cat", EXPENSE_CATEGORIES.map(c => [c, c]), d.category || "Utilities")) +
      pmsField("Amount (\u20B1) *", pmsNum("pms-exp-amount", d.amount)) +
      pmsField("Date", pmsDate("pms-exp-date", d.date || new Date().toISOString().slice(0, 10))) +
      pmsField("Description", pmsTxt("pms-exp-desc", d.description, "e.g. Water bill"), "", true);
    pmsModal(id ? "Edit Expense" : "New Expense", body, "expense", id);
  }

  function openDocumentEditor(id) {
    const d = id ? pms().documents.find(x => x.id === id) || {} : {};
    const props = pmsActiveProperties(), units = pmsActiveUnits();
    let propSel = props.length
      ? pmsSel("pms-doc-prop", [["", "— none —"]].concat(props.map(p => [p.id, p.title])), d.property_id || "")
      : pmsSel("pms-doc-prop", [["", "— add a property first —"]], "");
    let body = pmsField("Name *", pmsTxt("pms-doc-name", d.name, "e.g. Lease Contract - 2B"), "", true) +
      pmsField("Type", pmsTxt("pms-doc-type", d.type, "e.g. PDF, JPEG")) +
      pmsField("Category", pmsSel("pms-doc-cat", DOC_CATEGORIES.map(c => [c, c]), d.category || "Contract")) +
      pmsField("Property", propSel) +
      pmsField("Unit", pmsSel("pms-doc-unit", [["", "— none —"]].concat(units.map(u => [u.id, pmsPropertyTitle(u.property_id) + " \u00B7 " + pmsUnitName(u.id)])), d.unit_id || "")) +
      pmsField("Date", pmsDate("pms-doc-date", d.date)) +
      pmsField("Notes", pmsTxt("pms-doc-notes", d.notes, "reference number, folder, etc."), "Demo mode stores registry metadata only (no file bytes).", true);
    pmsModal(id ? "Edit Document" : "New Document", body, "document", id);
  }

  function savePmsForm(kind) {
    if (!pmsCan("manage")) { toast("You don't have permission to manage Property Management records", "err"); return; }
    if (kind === "property") return savePropForm();
    if (kind === "unit") return saveUnitForm();
    if (kind === "owner") return saveOwnerForm();
    if (kind === "tenant") return saveTenantForm();
    if (kind === "lease") return saveLeaseForm();
    if (kind === "payment") return savePaymentForm();
    if (kind === "maintenance") return saveMaintForm();
    if (kind === "expense") return saveExpenseForm();
    if (kind === "document") return saveDocumentForm();
  }

  function savePropForm() {
    const title = $("#pms-prop-title").value.trim();
    if (!title) { toast("Property title is required", "err"); return; }
    const id = $("#pms-modal").getAttribute("data-edit-id") || null;
    const data = {
      title: title,
      type: $("#pms-prop-type").value,
      status: $("#pms-prop-status").value,
      owner_id: $("#pms-prop-owner").value,
      price: C.num($("#pms-prop-price").value, 0),
      rent: C.num($("#pms-prop-rent").value, 0),
      address: $("#pms-prop-address").value.trim(),
      barangay: $("#pms-prop-brgy").value.trim(),
      city: $("#pms-prop-city").value.trim(),
      province: $("#pms-prop-prov").value.trim(),
      amenities: $("#pms-prop-amen").value.split(",").map(s => s.trim()).filter(Boolean),
      description: $("#pms-prop-desc").value.trim()
    };
    const store = pms().properties;
    if (id) {
      const rec = store.find(x => x.id === id);
      if (rec) { Object.assign(rec, data); rec.updatedAt = Date.now(); }
    } else {
      store.unshift(Object.assign({ id: pmsNewId("p"), createdAt: Date.now(), archived: false }, data));
    }
    save(); closePmsModal(); toast("Property saved"); render();
  }

  function saveUnitForm() {
    const no = $("#pms-unit-no").value.trim();
    if (!no) { toast("Unit number is required", "err"); return; }
    const id = $("#pms-modal").getAttribute("data-edit-id") || null;
    const data = {
      property_id: $("#pms-unit-prop").value,
      unit_number: no,
      status: $("#pms-unit-status").value,
      bedrooms: C.num($("#pms-unit-beds").value, 0),
      bathrooms: C.num($("#pms-unit-baths").value, 0),
      size: C.num($("#pms-unit-size").value, 0),
      rent_amount: C.num($("#pms-unit-rent").value, 0),
      tenant_name: $("#pms-unit-tenant").value.trim(),
      notes: $("#pms-unit-notes").value.trim()
    };
    const store = pms().units;
    if (id) {
      const rec = store.find(x => x.id === id);
      if (rec) { Object.assign(rec, data); rec.updatedAt = Date.now(); }
    } else {
      store.unshift(Object.assign({ id: pmsNewId("u"), createdAt: Date.now(), archived: false }, data));
    }
    save(); closePmsModal(); toast("Unit saved"); render();
  }

  async function createPmsOwnerAccount(owner) {
    const email = String(owner.email || "").trim().toLowerCase();
    if (currentUser && currentUser.demo) {
      if (!remoteProfilesLoaded) remoteProfiles = demoCloudProfiles().slice();
      if (remoteProfiles.some(p => String(p.email || "").toLowerCase() === email)) throw new Error("Email already registered");
      const id = "demo-pms-owner-" + Date.now().toString(36);
      remoteProfiles.unshift({ id: id, email: email, full_name: owner.name, role: "owner", registration_status: "pending", requested_role: "owner", agency: owner.company || "", pmsOwnerId: owner.id });
      remoteProfilesLoaded = true;
      return id;
    }
    if (SB && currentUser && currentUser.id) {
      const password = temporaryPassword();
      const id = await adminCreateAccount({
        email: email,
        password: password,
        full_name: owner.name,
        role: "owner",
        prc: null,
        resa: null,
        agency: owner.company || null,
        broker: null
      });
      pmsCreatedPassword = password;
      remoteProfilesLoaded = false;
      return id;
    }
    ensureOwnerAccount(owner);
    return "pms-owner-" + owner.id;
  }

  function removeLinkedPmsOwner(authUserId) {
    const owner = (pms().owners || []).find(o => String(o.authUserId || "") === String(authUserId || ""));
    if (!owner) return null;
    owner.archived = true;
    owner.accountStatus = "deleted";
    owner.updatedAt = Date.now();
    state.users = (state.users || []).filter(u => u.pmsOwnerId !== owner.id);
    const em = String(owner.email || "").toLowerCase();
    let auth = [];
    try { auth = JSON.parse(localStorage.getItem("esrealty_users") || "[]"); } catch (e) {}
    auth = auth.filter(u => String(u.email || "").toLowerCase() !== em);
    localStorage.setItem("esrealty_users", JSON.stringify(auth));
    return owner;
  }

  function pmsOwnerDependencies(ownerId) {
    const linkedProperties = (pms().properties || []).filter(property => property.owner_id === ownerId);
    const activeProperties = linkedProperties.filter(property => property.archived !== true);
    const propertyIds = linkedProperties.map(property => property.id);
    const unitIds = (pms().units || []).filter(unit => propertyIds.indexOf(unit.property_id) >= 0).map(unit => unit.id);
    const tenantIds = (pms().tenants || []).filter(tenant => tenant.owner_id === ownerId).map(tenant => tenant.id);
    const activeLeases = pmsActiveLeases().filter(lease =>
      lease.owner_id === ownerId ||
      propertyIds.indexOf(lease.property_id) >= 0 ||
      unitIds.indexOf(lease.unit_id) >= 0 ||
      tenantIds.indexOf(lease.tenant_id) >= 0
    );
    return { properties: activeProperties.length, leases: activeLeases.length };
  }

  function allowPmsOwnerDeletion(owner) {
    if (!owner) return true;
    const deps = pmsOwnerDependencies(owner.id);
    if (!deps.properties && !deps.leases) return true;
    const propertyText = deps.properties + " " + (deps.properties === 1 ? "property" : "properties");
    const leaseText = deps.leases + " " + (deps.leases === 1 ? "lease" : "leases");
    toast("Cannot delete owner. Clear " + propertyText + " and " + leaseText + " first.", "err");
    return false;
  }

  function allowPmsTenantDeletion(tenant) {
    if (!tenant) return true;
    const leaseCount = (pms().leases || []).filter(l => l.tenant_id === tenant.id && l.archived !== true).length;
    if (!leaseCount) return true;
    toast("Cannot delete tenant. " + leaseCount + " " + (leaseCount === 1 ? "lease" : "leases") + " on file for " + esc(tenant.name || tenant.email) + ".", "err");
    return false;
  }

  function syncPmsOwnersFromProfiles() {
    let changed = false;
    (remoteProfiles || []).forEach(profile => {
      if (profile.role !== "owner" || profile.registration_status === "rejected") return;
      const authId = String(profile.id || "");
      const email = String(profile.email || "").trim().toLowerCase();
      if (!authId || !email) return;
      let owner = (pms().owners || []).find(o => String(o.authUserId || "") === authId);
      if (!owner) owner = (pms().owners || []).find(o => o.archived !== true && !o.authUserId && String(o.email || "").trim().toLowerCase() === email);
      if (owner) {
        if (!owner.authUserId) { owner.authUserId = authId; changed = true; }
        if (owner.accountStatus !== profile.registration_status) { owner.accountStatus = profile.registration_status; changed = true; }
        return;
      }
      pms().owners.unshift({
        id: pmsNewId("o"),
        name: profile.full_name || email.split("@")[0],
        email: email,
        phone: profile.phone || "",
        company: profile.agency || "",
        bank: "",
        account_number: "",
        account_name: "",
        notes: "Created from Users & Access",
        authUserId: authId,
        accountStatus: profile.registration_status || "pending",
        createdAt: Date.now(),
        archived: false
      });
      changed = true;
    });
    if (changed) save();
    return changed;
  }

  async function saveOwnerForm() {
    const name = $("#pms-own-name").value.trim();
    if (!name) { toast("Owner name is required", "err"); return; }
    const email = $("#pms-own-email").value.trim();
    if (!email) { toast("Owner email is required — it's the owner's login", "err"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { toast("Enter a valid owner email", "err"); return; }
    const id = $("#pms-modal").getAttribute("data-edit-id") || null;
    const data = {
      name: name,
      email: email,
      phone: $("#pms-own-phone").value.trim(),
      company: $("#pms-own-company").value.trim(),
      bank: $("#pms-own-bank").value.trim(),
      account_number: $("#pms-own-acct").value.trim(),
      account_name: $("#pms-own-acctname").value.trim(),
      notes: $("#pms-own-notes").value.trim()
    };
    const store = pms().owners;
    let ownerRec;
    if (id) {
      ownerRec = store.find(x => x.id === id);
      if (ownerRec) { Object.assign(ownerRec, data); ownerRec.updatedAt = Date.now(); }
    } else {
      ownerRec = Object.assign({ id: pmsNewId("o"), createdAt: Date.now(), archived: false }, data);
      const saveButton = $('[data-pms-save="owner"]');
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Creating account..."; }
      try {
        ownerRec.authUserId = await createPmsOwnerAccount(ownerRec);
        ownerRec.accountStatus = "pending";
        store.unshift(ownerRec);
      } catch (err) {
        if (saveButton) { saveButton.disabled = false; saveButton.innerHTML = icon("check", 15) + " Save"; }
        toast("Could not create owner account: " + esc(friendlyErr(err.message || err)), "err");
        return;
      }
    }
    if (!(currentUser && (currentUser.demo || (SB && currentUser.id)))) ensureOwnerAccount(ownerRec);
    save(); closePmsModal();
    if (!id) {
      state.usersTab = "pending";
      toast("Owner saved — account pending approval. Temporary password: <b>" + esc(pmsCreatedPassword) + "</b>");
      if (!currentUser.demo) loadCloudProfiles(true);
    } else toast("Owner saved");
    render();
  }

  function ensureOwnerAccount(owner) {
    const email = owner ? String(owner.email || "").trim() : "";
    const name = owner ? (owner.name || "") : "";
    if (!email || owner.archived === true) return;
    const em = String(email).toLowerCase();
    let users = [];
    try { users = JSON.parse(localStorage.getItem("esrealty_users") || "[]"); } catch (e) {}
    const existing = users.find(u => String(u.email || "").toLowerCase() === em);
    if (existing) {
      existing.name = name || existing.name;
      existing.role = "owner";
      if (!existing.password) existing.password = "123456";
    } else {
      users.push({ email: em, name: name || em.split("@")[0], role: "owner", password: "123456", createdAt: Date.now() });
    }
    localStorage.setItem("esrealty_users", JSON.stringify(users));
    syncOwnerUser(owner);
  }

  function ensureTenantAccount(tenant, lease) {
    const email = tenant ? String(tenant.email || "").trim() : "";
    const name = tenant ? (tenant.name || "") : "";
    if (!email || !lease || !tenant || !tenant.id) return;
    const em = String(email).toLowerCase();

    let users = [];
    try { users = JSON.parse(localStorage.getItem("esrealty_users") || "[]"); } catch (e) {}
    const existing = users.find(u => String(u.email || "").toLowerCase() === em);
    if (existing) {
      existing.name = name || existing.name;
      if (!existing.role || existing.role === "tenant") existing.role = "tenant";
      if (!existing.password) existing.password = "123456";
    } else {
      users.push({ email: em, name: name || em.split("@")[0], role: "tenant", password: "123456", createdAt: Date.now() });
    }
    localStorage.setItem("esrealty_users", JSON.stringify(users));

    if (!state.users) state.users = [];
    const uid = "pms-tenant-" + tenant.id;
    const rec = state.users.find(x => x.id === uid) || state.users.find(x => String(x.email || "").toLowerCase() === em && x.role === "tenant");
    const base = {
      id: uid,
      name: name || em.split("@")[0],
      email: em,
      role: "tenant",
      agency: lease && lease.property_id ? pmsPropertyTitle(lease.property_id) : "",
      active: tenant.archived !== true,
      pmsTenantId: tenant.id,
      pmsLeaseId: lease.id || "",
      createdAt: (rec && rec.createdAt) || new Date().toISOString()
    };
    if (rec) { Object.assign(rec, base); rec.updatedAt = new Date().toISOString(); }
    else state.users.push(Object.assign({}, base));
  }

  function syncOwnerUser(owner) {
    if (!owner || !owner.id || owner.archived === true) return;
    const em = String(owner.email || "").toLowerCase();
    if (!em) return;
    if (!state.users) state.users = [];
    const uid = "pms-owner-" + owner.id;
    const rec = state.users.find(x => x.id === uid);
    const base = {
      id: uid,
      name: owner.name || em.split("@")[0],
      email: em,
      role: "owner",
      agency: owner.company || "",
      active: owner.archived !== true,
      pmsOwnerId: owner.id,
      authUserId: owner.authUserId || uid,
      createdAt: (rec && rec.createdAt) || new Date().toISOString()
    };
    if (rec) { Object.assign(rec, base); rec.updatedAt = new Date().toISOString(); }
    else state.users.push(Object.assign({}, base));
  }

  function pmsTenantAuthExisting(tenant) {
    const email = tenant ? String(tenant.email || "").trim().toLowerCase() : "";
    if (!email) return null;
    if (tenant.authUserId) return { id: String(tenant.authUserId), status: tenant.accountStatus || "pending", email: email };
    const profile = (remoteProfiles || []).find(p => String(p.email || "").trim().toLowerCase() === email);
    if (profile) return { id: String(profile.id), status: profile.registration_status || "pending", email: email };
    const local = (state.users || []).find(u => String(u.email || "").trim().toLowerCase() === email);
    if (local) return { id: local.authUserId || local.id, status: local.registrationStatus || (local.active === false ? "rejected" : "approved"), email: email };
    return null;
  }

  async function createPmsTenantAccount(tenant, lease) {
    const email = String(tenant.email || "").trim().toLowerCase();
    if (!email || !tenant.id) return { id: null, created: false };
    const existing = pmsTenantAuthExisting(tenant);
    if (existing) {
      tenant.authUserId = existing.id;
      tenant.accountStatus = existing.status;
      return { id: existing.id, created: false };
    }
    let id;
    if (currentUser && currentUser.demo) {
      if (!remoteProfilesLoaded) remoteProfiles = demoCloudProfiles().slice();
      id = "demo-pms-tenant-" + Date.now().toString(36);
      remoteProfiles.unshift({ id: id, email: email, full_name: tenant.name, role: "tenant", registration_status: "pending", requested_role: "tenant", pmsTenantId: tenant.id });
      remoteProfilesLoaded = true;
    } else if (SB && currentUser && currentUser.id) {
      const password = temporaryPassword();
      try {
        id = await adminCreateAccount({
          email: email,
          password: password,
          full_name: tenant.name,
          role: "tenant",
          prc: null,
          resa: null,
          agency: lease && lease.property_id ? pmsPropertyTitle(lease.property_id) : null,
          broker: null
        });
      } catch (err) {
        const low = String((err && err.message) || err || "").toLowerCase();
        if (low.indexOf("already registered") >= 0 || low.indexOf("already been registered") >= 0 || low.indexOf("duplicate") >= 0) {
          remoteProfilesLoaded = false;
          await loadCloudProfiles(true);
          const prof = (remoteProfiles || []).find(p => String(p.email || "").trim().toLowerCase() === email);
          if (prof) {
            tenant.authUserId = String(prof.id);
            tenant.accountStatus = prof.registration_status || "pending";
            return { id: String(prof.id), created: false };
          }
          throw new Error("Tenant already has an account (" + email + ")");
        }
        throw err;
      }
      pmsCreatedPassword = password;
      remoteProfilesLoaded = false;
      id = String(id);
    } else {
      ensureTenantAccount(tenant, lease);
      id = "pms-tenant-" + tenant.id;
    }
    tenant.authUserId = id;
    tenant.accountStatus = "pending";
    return { id: id, created: true };
  }

  function removeLinkedPmsTenant(authUserId) {
    const tenant = (pms().tenants || []).find(t => String(t.authUserId || "") === String(authUserId || ""));
    if (!tenant) return null;
    const hasActive = pmsActiveLeases().some(l => l.tenant_id === tenant.id);
    if (hasActive) return null;
    tenant.archived = true;
    tenant.accountStatus = "deleted";
    tenant.updatedAt = Date.now();
    state.users = (state.users || []).filter(u => u.pmsTenantId !== tenant.id);
    const em = String(tenant.email || "").toLowerCase();
    let auth = [];
    try { auth = JSON.parse(localStorage.getItem("esrealty_users") || "[]"); } catch (e) {}
    auth = auth.filter(u => String(u.email || "").toLowerCase() !== em);
    localStorage.setItem("esrealty_users", JSON.stringify(auth));
    return tenant;
  }

  function syncPmsTenantsFromProfiles() {
    let changed = false;
    (remoteProfiles || []).forEach(profile => {
      if (profile.role !== "tenant" || profile.registration_status === "rejected") return;
      const authId = String(profile.id || "");
      const email = String(profile.email || "").trim().toLowerCase();
      if (!authId || !email) return;
      let tenant = (pms().tenants || []).find(t => String(t.authUserId || "") === authId);
      if (!tenant) tenant = (pms().tenants || []).find(t => t.archived !== true && !t.authUserId && String(t.email || "").trim().toLowerCase() === email);
      if (tenant) {
        if (!tenant.authUserId) { tenant.authUserId = authId; changed = true; }
        if (tenant.accountStatus !== profile.registration_status) { tenant.accountStatus = profile.registration_status; changed = true; }
        return;
      }
      pms().tenants.unshift({
        id: pmsNewId("t"),
        name: profile.full_name || email.split("@")[0],
        email: email,
        phone: profile.phone || "",
        employment: "",
        monthly_income: 0,
        owner_id: "",
        notes: "Created from Users & Access",
        authUserId: authId,
        accountStatus: profile.registration_status || "pending",
        createdAt: Date.now(),
        archived: false
      });
      changed = true;
    });
    if (changed) save();
    return changed;
  }

  async function saveTenantForm() {
    const name = $("#pms-ten-name").value.trim();
    if (!name) { toast("Tenant name is required", "err"); return; }
    const email = $("#pms-ten-email").value.trim();
    if (!email) { toast("Tenant email is required", "err"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { toast("Enter a valid tenant email", "err"); return; }
    const id = $("#pms-modal").getAttribute("data-edit-id") || null;
    const em = String(email).toLowerCase();
    const duplicate = (pms().tenants || []).find(t => t.id !== id && String(t.email || "").trim().toLowerCase() === em);
    if (duplicate) { toast("Email already used by tenant " + esc(duplicate.name || duplicate.email) + " — each tenant needs a unique email", "err"); return; }
    const current = id ? (pms().tenants || []).find(t => t.id === id) : null;
    const saveButton = $('[data-pms-save="tenant"]');
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Checking email..."; }
    if (canManageUsers() && ((currentUser && currentUser.demo) || (SB && currentUser && currentUser.id))) await loadCloudProfiles(true);
    const registered = (remoteProfiles || []).find(profile =>
      String(profile.email || "").trim().toLowerCase() === em &&
      (!current || String(profile.id || "") !== String(current.authUserId || ""))
    );
    const localRegistered = (state.users || []).find(user =>
      String(user.email || "").trim().toLowerCase() === em &&
      (!current || (String(user.id || "") !== String(current.authUserId || "") && user.pmsTenantId !== current.id))
    );
    if (registered || localRegistered) {
      if (saveButton) { saveButton.disabled = false; saveButton.innerHTML = icon("check", 15) + " Save"; }
      toast("Email already registered in Users & Access: " + esc(email), "err");
      return;
    }
    const data = {
      name: name,
      email: email,
      phone: $("#pms-ten-phone").value.trim(),
      employment: $("#pms-ten-emp").value.trim(),
      monthly_income: C.num($("#pms-ten-income").value, 0),
      owner_id: ($("#pms-ten-owner") && $("#pms-ten-owner").value) || "",
      notes: $("#pms-ten-notes").value.trim()
    };
    const store = pms().tenants;
    if (id) {
      const rec = store.find(x => x.id === id);
      if (rec) {
        Object.assign(rec, data);
        rec.updatedAt = Date.now();
        const lease = (pms().leases || []).find(l => l.tenant_id === rec.id && !l.archived);
        if (lease) ensureTenantAccount(rec, lease);
      }
    } else {
      const rec = Object.assign({ id: pmsNewId("t"), createdAt: Date.now(), archived: false }, data);
      store.unshift(rec);
      const lease = (pms().leases || []).find(l => l.tenant_id === rec.id && !l.archived);
      if (lease) ensureTenantAccount(rec, lease);
    }
    save(); closePmsModal(); toast("Tenant saved"); render();
  }

  async function saveLeaseForm() {
    const unit_id = $("#pms-lease-unit").value;
    const tenant_id = $("#pms-lease-tenant").value;
    if (!unit_id) { toast("Select a unit", "err"); return; }
    if (!tenant_id) { toast("Select a tenant", "err"); return; }
    const unit = pms().units.find(x => x.id === unit_id);
    const id = $("#pms-modal").getAttribute("data-edit-id") || null;
    const status = $("#pms-lease-status").value;
    const startVal = $("#pms-lease-start").value, endVal = $("#pms-lease-end").value;
    const rentType = $("#pms-lease-rtype").value === "lease" ? "lease" : "monthly";
    const rentAmount = rentType === "lease" ? C.num($("#pms-lease-total").value, 0) : C.num($("#pms-lease-rent").value, 0);
    if (!startVal || !endVal) { toast("Lease start and end dates are required", "err"); return; }
    if (new Date(endVal + "T00:00:00") < new Date(startVal + "T00:00:00")) { toast("Lease end date cannot be before the start date", "err"); return; }
    if (rentAmount <= 0) { toast("Lease rent must be greater than zero", "err"); return; }
    const autoStatus = pmsAutoStatus({ start: startVal, end: endVal, status: "active" });
    const finalStatus = status === "terminated" ? "terminated" : autoStatus;
    if (finalStatus === "active" && unit) {
      const cap = pmsUnitCapacity(unit), beds = Math.floor(C.num(unit.bedrooms, 0));
      const used = pmsActiveLeases().filter(l => l.unit_id === unit_id && l.status === "active" && l.id !== id).length;
      if (used >= cap) {
        toast("Unit full \u2014 max " + cap + " tenant" + (cap === 1 ? "" : "s") + " for " + (beds > 0 ? beds + " bed" + (beds === 1 ? "" : "s") : "this unit"), "err");
        return;
      }
    }
    const data = {
      property_id: unit ? unit.property_id : "",
      unit_id: unit_id,
      tenant_id: tenant_id,
      owner_id: unit ? (pms().properties.find(p => p.id === unit.property_id) || {}).owner_id || "" : "",
      start: startVal,
      end: endVal,
      rent_type: rentType,
      rent: rentAmount,
      deposit: C.num($("#pms-lease-dep").value, 0),
      due_day: String(Math.min(28, Math.max(1, Math.floor(C.num($("#pms-lease-due").value, 0)) || 10))),
      status: finalStatus,
      notes: $("#pms-lease-notes").value.trim()
    };
    const store = pms().leases;
    if (id) {
      const rec = store.find(x => x.id === id);
      if (rec) { Object.assign(rec, data); rec.updatedAt = Date.now(); }
    } else {
      store.unshift(Object.assign({ id: pmsNewId("l"), createdAt: Date.now(), archived: false }, data));
    }
    const savedLease = id ? store.find(x => x.id === id) : store[0];
    const tenant = pms().tenants.find(x => x.id === tenant_id);
    syncUnitFromLeases();
    save();
    let leaseToast = "Lease saved";
    let leaseToastErr = false;
    if (tenant && savedLease) {
      if (!id) {
        const saveBtn = $('[data-pms-save="lease"]');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Creating tenant account..."; }
        try {
          const acc = await createPmsTenantAccount(tenant, savedLease);
          save();
          if (acc && acc.created) {
            state.usersTab = "pending";
            leaseToast = "Lease saved \u2014 tenant account created. Temporary password: <b>" + esc(pmsCreatedPassword) + "</b>";
          } else {
            leaseToast = "Lease saved \u2014 tenant already has an account";
          }
          if (!currentUser.demo && SB && currentUser.id) loadCloudProfiles(true);
        } catch (err) {
          leaseToastErr = true;
          leaseToast = "Lease saved but tenant account could not be created: " + esc(friendlyErr(err.message || err));
        } finally {
          if (saveBtn) { saveBtn.disabled = false; }
        }
      } else {
        ensureTenantAccount(tenant, savedLease);
      }
    }
    closePmsModal(); render();
    toast(leaseToast, leaseToastErr ? "err" : "");
  }

  function pmsReadProof(file, cb) {
    if (!file) { cb(""); return; }
    if (file.size > 3000000) { toast("Image too large (max 3MB)", "err"); cb(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        let w = img.width, h = img.height;
        if (Math.max(w, h) > max) {
          const r = max / Math.max(w, h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(cv.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => { toast("Could not read image", "err"); cb(null); };
      img.src = String(reader.result);
    };
    reader.onerror = () => { toast("Could not read file", "err"); cb(null); };
    reader.readAsDataURL(file);
  }

  function savePaymentForm() {
    const lease_id = $("#pms-pay-lease").value;
    if (!lease_id) { toast("Select a lease", "err"); return; }
    const lease = pms().leases.find(x => x.id === lease_id);
    const id = $("#pms-modal").getAttribute("data-edit-id") || null;
    const existing = id ? (pms().payments.find(x => x.id === id) || {}) : {};
    const amount = C.num($("#pms-pay-amount").value, 0);
    if (amount <= 0) { toast("Payment amount must be greater than zero", "err"); return; }
    const data = {
      lease_id: lease_id,
      property_id: lease ? lease.property_id : "",
      unit_id: lease ? lease.unit_id : "",
      tenant_id: lease ? lease.tenant_id : "",
      amount: amount,
      date: $("#pms-pay-date").value,
      month: $("#pms-pay-month").value.trim(),
      method: $("#pms-pay-method").value,
      status: $("#pms-pay-status").value,
      notes: $("#pms-pay-notes").value.trim()
    };
    if (existing.proof) { data.proof = existing.proof; data.proofName = existing.proofName || ""; }
    const fileEl = $("#pms-pay-proof");
    const persist = () => {
      const store = pms().payments;
      if (id) {
        const rec = store.find(x => x.id === id);
        if (rec) { Object.assign(rec, data); rec.updatedAt = Date.now(); }
      } else {
        store.unshift(Object.assign({ id: pmsNewId("p"), createdAt: Date.now(), archived: false }, data));
      }
      save(); closePmsModal(); toast("Payment recorded"); render();
    };
    if (fileEl && fileEl.files && fileEl.files.length) {
      const f = fileEl.files[0];
      if (!/^image\//.test(f.type)) { toast("Proof must be an image (JPEG/PNG)", "err"); return; }
      pmsReadProof(f, proof => {
        if (proof === null) return;
        data.proof = proof;
        data.proofName = f.name;
        persist();
      });
    } else {
      persist();
    }
  }

  function saveMaintForm() {
    const title = $("#pms-maint-title").value.trim();
    if (!title) { toast("Work order title is required", "err"); return; }
    const unit_id = $("#pms-maint-unit").value;
    const unit = pms().units.find(x => x.id === unit_id);
    const id = $("#pms-modal").getAttribute("data-edit-id") || null;
    const data = {
      title: title,
      unit_id: unit_id,
      property_id: unit ? unit.property_id : "",
      category: $("#pms-maint-cat").value,
      priority: $("#pms-maint-pri").value,
      status: $("#pms-maint-status").value,
      cost: C.num($("#pms-maint-cost").value, 0),
      vendor: $("#pms-maint-vendor").value.trim(),
      date: $("#pms-maint-date").value,
      notes: $("#pms-maint-notes").value.trim()
    };
    const store = pms().maintenance;
    if (id) {
      const rec = store.find(x => x.id === id);
      if (rec) { Object.assign(rec, data); rec.updatedAt = Date.now(); }
    } else {
      store.unshift(Object.assign({ id: pmsNewId("m"), createdAt: Date.now(), archived: false }, data));
    }
    save(); closePmsModal(); toast("Work order saved"); render();
  }

  function saveExpenseForm() {
    const amount = C.num($("#pms-exp-amount").value, 0);
    if (amount <= 0) { toast("Enter an expense amount", "err"); return; }
    const id = $("#pms-modal").getAttribute("data-edit-id") || null;
    const data = {
      property_id: $("#pms-exp-prop").value,
      category: $("#pms-exp-cat").value,
      amount: amount,
      date: $("#pms-exp-date").value,
      description: $("#pms-exp-desc").value.trim()
    };
    const store = pms().expenses;
    if (id) {
      const rec = store.find(x => x.id === id);
      if (rec) { Object.assign(rec, data); rec.updatedAt = Date.now(); }
    } else {
      store.unshift(Object.assign({ id: pmsNewId("e"), createdAt: Date.now(), archived: false }, data));
    }
    save(); closePmsModal(); toast("Expense saved"); render();
  }

  function saveDocumentForm() {
    const name = $("#pms-doc-name").value.trim();
    if (!name) { toast("Document name is required", "err"); return; }
    const id = $("#pms-modal").getAttribute("data-edit-id") || null;
    const data = {
      name: name,
      type: $("#pms-doc-type").value.trim(),
      category: $("#pms-doc-cat").value,
      property_id: $("#pms-doc-prop").value,
      unit_id: $("#pms-doc-unit").value,
      date: $("#pms-doc-date").value,
      notes: $("#pms-doc-notes").value.trim()
    };
    const store = pms().documents;
    if (id) {
      const rec = store.find(x => x.id === id);
      if (rec) { Object.assign(rec, data); rec.updatedAt = Date.now(); }
    } else {
      store.unshift(Object.assign({ id: pmsNewId("d"), createdAt: Date.now(), archived: false }, data));
    }
    save(); closePmsModal(); toast("Document saved"); render();
  }

  async function archivePms(kind, id) {
    if (!pmsCan("manage")) { toast("You don't have permission to manage Property Management records", "err"); return; }
    const map = { property: "properties", unit: "units", owner: "owners", tenant: "tenants", lease: "leases", payment: "payments", maintenance: "maintenance", expense: "expenses", document: "documents" };
    const store = pms()[map[kind]] || [];
    const rec = store.find(x => x.id === id);
    if (!rec) return;
    if (kind === "owner" && !allowPmsOwnerDeletion(rec)) return;
    if (kind === "tenant" && !allowPmsTenantDeletion(rec)) return;
    if (kind === "property") {
      const units = pmsActiveUnits().filter(x => x.property_id === id).length;
      const leases = pmsActiveLeases().filter(x => x.property_id === id).length;
      if (units || leases) { toast("Cannot archive property. Clear " + units + " active unit(s) and " + leases + " lease(s) first.", "err"); return; }
    }
    if (kind === "unit") {
      const leases = pmsActiveLeases().filter(x => x.unit_id === id).length;
      if (leases) { toast("Cannot archive unit while it has " + leases + " lease(s) on file.", "err"); return; }
    }
    if (kind === "lease") {
      const payments = pmsActivePayments().filter(x => x.lease_id === id).length;
      if (payments) { toast("Cannot archive lease while it has " + payments + " payment record(s). Set the lease to Terminated to preserve its history.", "err"); return; }
    }
    const label = rec.title || rec.name || rec.unit_number || (rec.amount ? C.money(rec.amount) : kind);
    const msg = kind === "owner"
      ? 'Delete "' + label + '"? It will be hidden from PMS lists and its account removed from Users & Access.'
      : 'Archive "' + label + '"? It will be hidden from lists but kept in the records.';
    if (!confirm(msg)) return;
    if (kind === "owner" && rec.authUserId) {
      try {
        if (currentUser && currentUser.demo) {
          remoteProfiles = remoteProfiles.filter(p => String(p.id) !== String(rec.authUserId));
          remoteProfilesLoaded = true;
        } else if (SB && currentUser && currentUser.id) {
          const result = await SB.rpc("admin_delete_account", { target_id: rec.authUserId });
          if (result.error) throw result.error;
          remoteProfiles = remoteProfiles.filter(p => String(p.id) !== String(rec.authUserId));
          remoteProfilesLoaded = false;
        }
      } catch (err) {
        toast("Could not delete linked owner account: " + esc(friendlyErr(err.message || err)), "err");
        return;
      }
    }
    rec.archived = true;
    rec.accountStatus = kind === "owner" ? "deleted" : rec.accountStatus;
    rec.updatedAt = Date.now();
    if (kind === "lease") syncUnitFromLeases();
    if (kind === "owner") {
      const em = String(rec.email || "").toLowerCase();
      const linked = (state.users || []).find(x => x.pmsOwnerId === id);
      if (linked) state.users = (state.users || []).filter(x => x.id !== linked.id);
      const shared = (state.users || []).some(x => String(x.email || "").toLowerCase() === em);
      if (!shared) {
        let auth = [];
        try { auth = JSON.parse(localStorage.getItem("esrealty_users") || "[]"); } catch (e) {}
        auth = auth.filter(x => String(x.email || "").toLowerCase() !== em);
        localStorage.setItem("esrealty_users", JSON.stringify(auth));
      }
    }
    save(); toast((kind === "owner" ? "Deleted" : "Archived") + " <b>" + esc(label) + "</b>", "err"); render();
  }

  /* ================= MARKET SCAN ================= */
  const MS_API = (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "http://localhost:8932" : "https://esrealty-market-scan.vercel.app";
  const MS_TYPES = ["", "Vacant Lot", "House & Lot", "Townhouse", "Condominium Unit", "Apartment", "Shophouse", "Commercial", "Warehouse", "Office"];
  function marketLocationForCity(city) {
    for (const r of D.PH_REGIONS) {
      for (const province of D.provincesFor(r[0])) {
        if (D.citiesFor(r[0], province).indexOf(city) !== -1) return { region: r[0], province };
      }
    }
    return { region: "", province: "" };
  }
  function clearMarketResults(query) {
    state.market = { query, results: [], sources: [], total: 0 };
    save(); render();
  }
  function facebookMarketplaceUrl(query) {
    const terms = [query.type, query.mode === "rent" ? "for rent" : "for sale", query.city, "Philippines"].filter(Boolean).join(" ");
    return "https://www.facebook.com/marketplace/search/?query=" + encodeURIComponent(terms);
  }

  function renderMarketScan() {
    const st = state.market || {};
    const q = st.query || {};
    const savedLocation = q.region ? { region: q.region, province: q.province || "" } : marketLocationForCity(q.city || "");
    const region = savedLocation.region;
    const province = savedLocation.province;
    const cities = region && province ? D.citiesFor(region, province) : [];
    let html = '<div class="hero"><div><h1>Market Scan</h1><p>Search for-sale / for-rent listings across property portals and social sources.</p></div></div>';
    html += '<div class="notice-banner">' + icon("search", 14) + ' <span>Live sources (DotProperty.com.ph, MyProperty.ph, OnePropertee, Carousell Philippines, Web Search, and publicly indexed Facebook posts) are fetched on demand by the hosted <b>Market Scan</b> service. Login-gated or private content is reported separately. Always verify a listing before transacting.</span></div>';
    if (st.error) {
      html += '<div class="notice-banner err">' + icon("pin", 14) + ' <span>Market Scan backend not reachable. Please try again in a moment — the first cloud scan can take up to a minute.</span></div>';
    }
    html += '<div class="card card-pad mt-16"><div class="row" style="gap:12px;align-items:end">' +
      '<div class="field col-2"><label>Region</label><select class="input" id="ms-region"><option value="">All regions</option>' + D.regionNames().map(x => '<option value="' + esc(x) + '"' + (x === region ? " selected" : "") + '>' + esc(x) + '</option>').join("") + '</select></div>' +
      '<div class="field col-2"><label>Province</label><select class="input" id="ms-province"' + (region ? "" : " disabled") + '><option value="">' + (region ? "All provinces" : "Select a region first") + '</option>' + (region ? D.provincesFor(region).map(x => '<option value="' + esc(x) + '"' + (x === province ? " selected" : "") + '>' + esc(x) + '</option>').join("") : "") + '</select></div>' +
      '<div class="field col-2"><label>City / Municipality</label><select class="input" id="ms-city"' + (province ? "" : " disabled") + '><option value="">' + (province ? "All cities / municipalities" : "Select a province first") + '</option>' + cities.map(x => '<option value="' + esc(x) + '"' + (x === (q.city || "") ? " selected" : "") + '>' + esc(x) + '</option>').join("") + '</select></div>' +
      '<div class="field col-2"><label>Property Type</label><select class="input" id="ms-type">' + MS_TYPES.map(t => '<option value="' + esc(t) + '"' + (t === (q.type || "") ? " selected" : "") + '>' + (t || "All types") + '</option>').join("") + '</select></div>' +
      '<div class="field col-2"><label>Mode</label><select class="input" id="ms-mode">' + '<option value="sale"' + ((q.mode || "sale") === "sale" ? " selected" : "") + '>For Sale</option><option value="rent"' + ((q.mode || "sale") === "rent" ? " selected" : "") + '>For Rent</option></select></div>' +
      '<div class="field col-2"><button class="btn btn-primary" id="ms-run" style="width:100%">' + icon("search", 15) + ' Run Search</button></div>' +
      '<div class="field col-12"><a class="btn btn-ghost btn-sm" id="ms-facebook-search" href="' + facebookMarketplaceUrl({ type: q.type || "", mode: q.mode || "sale", city: q.city || "" }) + '" target="_blank" rel="noopener">' + icon("share", 14) + ' Open Facebook Marketplace</a><span class="field-hint" style="margin-left:8px">Opens Facebook’s own search in a new tab. Sign in to Facebook to see Marketplace and private/group posts.</span></div>' +
      '</div><div class="row mt-16" style="gap:12px;align-items:end">' +
      '<div class="field col-2"><label>Min Price (₱)</label><input class="input input-num" id="ms-minp" value="' + esc(q.minPrice || "") + '"></div>' +
       '<div class="field col-2"><label>Max Price (₱)</label><input class="input input-num" id="ms-maxp" value="' + esc(q.maxPrice || "") + '"></div>' +
       '<div class="field col-2"><label>Min Area (sqm)</label><input class="input input-num" id="ms-mina" value="' + esc(q.minArea || "") + '"></div>' +
       '<div class="field col-2"><label>Min Bedrooms</label><input class="input input-num" id="ms-minb" value="' + esc(q.minBeds || "") + '"></div>' +
       '<div class="field col-2"><label>Max Results</label><input class="input input-num" id="ms-max" value="' + (q.maxResults || 40) + '"></div>' +
       '<div class="field col-2"><label class="ms-chk"><input type="checkbox" id="ms-live"' + (q.live === false ? "" : " checked") + '> Include live web sources</label></div>' +
      '</div></div>';
    html += '<div id="market-status" class="mt-16"></div>';
    html += '<div id="market-results" class="mt-16">' + (st.results && st.results.length ? marketResultsHtml(st) : marketEmptyHtml()) + '</div>';
    return html;
  }

  function marketEmptyHtml() {
    return '<div class="card card-pad empty">' + icon("search", 50) + '<h3>Run a market scan</h3><p>Set your filters and press <b>Run Search</b> to pull live listings from DotProperty.com.ph, MyProperty.ph and web search, plus local benchmark reference data when offline.</p><div class="row" style="justify-content:center;margin-top:10px"><button class="btn btn-primary" data-run-market="1">' + icon("search", 15) + ' Run Search</button></div></div>';
  }

  function marketResultsHtml(st) {
    const srcs = st.sources || [];
    let chips = '<div class="row" style="gap:8px;flex-wrap:wrap">' + srcs.map(s => {
      const cls = s.status === "ok" ? "green" : (s.status === "error" ? "red" : "gold");
      const ic = s.status === "ok" ? "check" : (s.status === "error" ? "trash" : "pin");
      const note = s.status === "ok" ? (s.count + " found") : s.status;
      return '<span class="badge ' + cls + '" title="' + esc(s.error || (s.status + " source")) + '">' + icon(ic, 11) + ' ' + esc(s.label) + ' · ' + esc(note) + '</span>';
    }).join("") + '</div>';
    chips += '<div class="dim tiny mt-8">' + (st.total || 0) + ' matched · showing ' + (st.results ? st.results.length : 0) + ' · ' + (st.elapsedMs != null ? st.elapsedMs + "ms" : "") + '</div>';
    const cards = st.results.map((l, i) => {
      const area = l.lotArea || l.floorArea;
      const perSqm = l.pricePerSqm ? '<div class="dim tiny">' + C.money(l.pricePerSqm) + '/sqm</div>' : "";
      const modeWord = l.mode === "rent" ? "For Rent" : "For Sale";
      const listingUrl = safeHttpsUrl(l.url);
      return '<article class="ms-card"><div class="ms-top"><div class="grow">' +
        (listingUrl ? '<a href="' + esc(listingUrl) + '" target="_blank" rel="noopener" class="ms-title">' + esc(l.title) + '</a>' : '<div class="ms-title">' + esc(l.title) + '</div>') +
        '<div class="dim tiny mt-4">' + esc(l.sourceLabel || l.source || "") + ' · ' + esc(l.city || "") + ' · ' + esc(l.propertyType || "—") + ' · ' + modeWord + '</div></div>' +
        '<div class="ms-price">' + (l.price ? C.money(l.price) : "—") + perSqm + '</div></div>' +
        '<div class="ms-meta">' +
        (l.bedrooms ? '<span>' + icon("home", 12) + ' ' + l.bedrooms + ' BR</span>' : "") +
        (l.bathrooms ? '<span>' + icon("home", 12) + ' ' + l.bathrooms + ' Bath</span>' : "") +
        (area ? '<span>' + C.numFmt(area) + ' sqm</span>' : "") +
        (l.verified ? '<span class="badge green">Verified</span>' : "") +
        '</div><div class="ms-foot"><button class="btn btn-ghost btn-sm" data-ms-comp="' + i + '">' + icon("scale", 13) + ' Add to Appraisal comparables</button></div>' +
        (l.description ? '<div class="dim tiny ms-desc">' + esc(l.description.slice(0, 150)) + (l.description.length > 150 ? "…" : "") + '</div>' : "") +
        '</article>';
    }).join("");
    return chips + '<div class="ms-grid">' + cards + '</div>';
  }

  function marketRun() {
    const q = {
      city: $("#ms-city").value.trim(),
      type: $("#ms-type").value,
      mode: $("#ms-mode").value,
      minPrice: C.num($("#ms-minp").value, 0),
      maxPrice: C.num($("#ms-maxp").value, 0),
      minArea: C.num($("#ms-mina").value, 0),
      minBeds: C.num($("#ms-minb").value, 0),
      maxResults: C.num($("#ms-max").value, 40) || 40,
      live: $("#ms-live").checked,
      region: $("#ms-region").value,
      province: $("#ms-province").value
    };
    state.market = { query: q, results: [], sources: [], running: true };
    save(); render();
    const el = $("#market-status");
    if (el) el.innerHTML = '<div class="notice-banner">' + icon("refresh", 14) + ' Scanning sources… first live run can take 15–40s.</div>';
    const qs = new URLSearchParams();
    Object.keys(q).forEach(k => qs.append(k, q[k]));
    fetch(MS_API + "/api/market-scan?" + qs.toString())
      .then(r => r.json())
      .then(d => {
        if (!d || !d.ok) throw new Error((d && d.error) || "Backend error");
        state.market = { query: q, results: d.listings || [], sources: d.sources || [], total: d.total || 0, elapsedMs: d.elapsedMs, ranAt: Date.now() };
        save(); render();
      })
      .catch(err => {
        state.market = Object.assign({}, state.market, { error: String((err && err.message) || err) });
        save(); render();
      });
  }

  function marketUseAsComp(l) {
    const a = activeAppraisal();
    a.comparables = a.comparables || [];
    const city = String(l.city || "").split(",")[0].trim();
    a.comparables.push({
      id: "c" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      address: l.title,
      city: city,
      saleDate: new Date().toISOString().slice(0, 10),
      price: l.price || 0,
      lotArea: l.lotArea || 0,
      floorArea: l.floorArea || 0,
      propertyType: l.propertyType || "Vacant Lot",
      transactionType: l.mode === "rent" ? "Listing" : "Arm\u2019s-length Sale",
      source: "Market Scan · " + (l.sourceLabel || l.source || "Web"),
      lat: l.lat || "", lng: l.lng || "", url: l.url || "", sample: false
    });
    appraisalAudit("Market Scan listing added as a comparable: " + l.title);
    save();
    state.appraisalTab = "comps";
    toast('Added <b>' + esc(l.title.slice(0, 60)) + '</b> to the appraisal comparables');
    navigate("appraisal");
  }

  function bindMarketScan() {
    $$("#content [data-run-market], #content #ms-run").forEach(b => b.addEventListener("click", marketRun));
    $$("#content #ms-city, #content #ms-max, #content #ms-minp, #content #ms-maxp, #content #ms-mina, #content #ms-minb").forEach(inp => inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); marketRun(); } }));
    const updateFacebookSearch = () => {
      const link = $("#ms-facebook-search");
      if (link) link.href = facebookMarketplaceUrl({ type: $("#ms-type").value, mode: $("#ms-mode").value, city: $("#ms-city").value });
    };
    const region = $("#ms-region");
    if (region) region.addEventListener("change", () => clearMarketResults(Object.assign({}, (state.market || {}).query, { region: region.value, province: "", city: "" })));
    const province = $("#ms-province");
    if (province) province.addEventListener("change", () => clearMarketResults(Object.assign({}, (state.market || {}).query, { region: $("#ms-region").value, province: province.value, city: "" })));
    const city = $("#ms-city");
    if (city) city.addEventListener("change", () => {
      state.market = Object.assign({}, state.market, { query: Object.assign({}, (state.market || {}).query, { region: $("#ms-region").value, province: $("#ms-province").value, city: city.value }) });
      save();
      updateFacebookSearch();
    });
    $$("#ms-type, #ms-mode").forEach(el => el.addEventListener("change", updateFacebookSearch));
    $$("#content [data-ms-comp]").forEach(b => b.addEventListener("click", () => {
      const st = state.market || {};
      const l = (st.results || [])[+b.getAttribute("data-ms-comp")];
      if (l) marketUseAsComp(l);
    }));
  }

  function emailPmsPayment(button) {
    if (!pmsCan("manage")) { toast("You don't have permission to email payment details", "err"); return; }
    const paymentId = button.getAttribute("data-pms-email-payment") || "";
    const payment = pms().payments.find(x => x.id === paymentId) || {
      lease_id: button.getAttribute("data-lease-id") || "",
      amount: C.num(button.getAttribute("data-payment-amount"), 0),
      date: button.getAttribute("data-payment-date") || "",
      month: button.getAttribute("data-payment-month") || "",
      status: button.getAttribute("data-payment-status") || "due",
      method: button.getAttribute("data-payment-method") || ""
    };
    const lease = pms().leases.find(x => x.id === payment.lease_id);
    const tenant = lease && pms().tenants.find(x => x.id === lease.tenant_id);
    const email = tenant ? String(tenant.email || "").trim() : "";
    if (!lease || !tenant) { toast("This payment is not linked to a valid tenant lease", "err"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { toast("The linked tenant does not have a valid email address", "err"); return; }
    const property = pmsPropertyTitle(lease.property_id);
    const unit = pmsUnitName(lease.unit_id);
    const status = String(payment.status || "due").replace(/\b\w/g, c => c.toUpperCase());
    const subject = "Payment details - " + property + " " + unit + " - " + (payment.month || "Lease");
    const body = [
      "Hello " + (tenant.name || "Tenant") + ",",
      "",
      "Here are the payment details for your lease:",
      "Property: " + property,
      "Unit: " + unit,
      "Payment period: " + (payment.month || "Not specified"),
      "Amount: " + C.money(payment.amount),
      (payment.status === "paid" ? "Payment date: " : "Due date: ") + (payment.date || "Not specified"),
      "Status: " + status,
      "Payment method: " + (payment.method || "Not specified"),
      payment.notes ? "Notes: " + payment.notes : "",
      "",
      "Please contact us if you have questions about this payment.",
      "",
      "Regards,",
      (currentUser && currentUser.name) || "Property Management"
    ].filter(line => line !== null).join("\n");
    const link = document.createElement("a");
    link.href = "mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast("Payment email prepared for <b>" + esc(email) + "</b>");
  }

  let pmsHooked = false;
  function bindPMS() {
    if (canManageUsers() && ((SB && currentUser && currentUser.id) || (currentUser && currentUser.demo))) loadCloudProfiles();
    if (pmsHooked) return;
    pmsHooked = true;
    document.addEventListener("click", e => {
      const tabBtn = e.target.closest("[data-pmtab]");
      if (tabBtn) { state.pmsTab = tabBtn.getAttribute("data-pmtab"); state.pmsQuery = ""; state.pmsStatusFilter = ""; state.pmsPropertyFilter = ""; state.pmsExtraFilter = ""; state.pmsLeaseFilter = ""; save(); render(); return; }
      const pl = e.target.closest("[data-pms-paylink]");
      if (pl) { state.pmsTab = "payments"; state.pmsQuery = ""; state.pmsStatusFilter = ""; state.pmsPropertyFilter = ""; state.pmsExtraFilter = ""; state.pmsLeaseFilter = pl.getAttribute("data-pms-paylink"); save(); render(); return; }
      const emailPayment = e.target.closest("[data-pms-email-payment]");
      if (emailPayment) { emailPmsPayment(emailPayment); return; }
      const cl = e.target.closest("[data-pms-clear-lease]");
      if (cl) { state.pmsLeaseFilter = ""; render(); return; }
      const ex = e.target.closest("[data-pms-export]");
      if (ex) { pmsReportsCSV(ex.getAttribute("data-pms-export")); return; }
      const nw = e.target.closest("[data-pms-new]");
      if (nw) { openPmsEditor(nw.getAttribute("data-pms-new")); return; }
      const ed = e.target.closest("[data-pms-edit]");
      if (ed) { const parts = ed.getAttribute("data-pms-edit").split(":"); openPmsEditor(parts[0], parts[1]); return; }
      const ppr = e.target.closest("[data-pms-print]");
      if (ppr) { const parts = ppr.getAttribute("data-pms-print").split(":"); if (parts[0] === "lease") pmsPrintPayable(parts[1]); return; }
      const prp = e.target.closest("[data-pms-printrep]");
      if (prp) { const parts = prp.getAttribute("data-pms-printrep").split(":"); if (parts[0] === "property") pmsPrintPropertyReport(parts[1]); return; }
      const prn = e.target.closest("[data-pms-doprint]");
      if (prn) { window.print(); return; }
      const ar = e.target.closest("[data-pms-archive]");
      if (ar) { const parts = ar.getAttribute("data-pms-archive").split(":"); archivePms(parts[0], parts[1]); return; }
      const sv = e.target.closest("[data-pms-save]");
      if (sv) { savePmsForm(sv.getAttribute("data-pms-save")); return; }
      if (e.target.closest("[data-pms-cancel]")) { closePmsModal(); return; }
    });
    document.addEventListener("input", e => {
      const t = e.target;
      if (t && t.id === "pms-search") {
        state.pmsQuery = t.value;
        const box = $("#pms-list");
        if (box) box.innerHTML = renderPMSListInner();
      }
    });
    document.addEventListener("change", e => {
      const t = e.target;
      if (t && t.id === "pms-filter-status") {
        state.pmsStatusFilter = t.value;
        const box = $("#pms-list");
        if (box) box.innerHTML = renderPMSListInner();
      }
      if (t && t.id === "pms-filter-property") {
        state.pmsPropertyFilter = t.value;
        const box = $("#pms-list");
        if (box) box.innerHTML = renderPMSListInner();
      }
      if (t && t.id === "pms-filter-extra") {
        state.pmsExtraFilter = t.value;
        const box = $("#pms-list");
        if (box) box.innerHTML = renderPMSListInner();
      }
    });
  }

  /* ================= LISTINGS STOREFRONT ================= */
  function listTypeLabel(v) { const f = LISTING_TYPES.find(x => x[0] === v); return f ? f[1] : (v || "—"); }
  function listingCanEdit(l) {
    if (!listingCanManage()) return false;
    if (!l || !l.id || (currentUser && currentUser.demo) || roleIs("super-admin")) return true;
    return !!(currentUser && currentUser.id && l.createdBy === currentUser.id);
  }
  function listStatusLabel(v) { const f = LISTING_STATUSES.find(x => x[0] === v); return f ? f[1] : (v || "—"); }
  function listStatusBadge(v) {
    const map = { available: "green", rfo: "blue", "pre-selling": "gold", reserved: "gold", sold: "red" };
    return '<span class="badge ' + (map[v] || "blue") + '">' + esc(listStatusLabel(v)) + "</span>";
  }
  function listingPriceSqm(l) {
    const base = C.num(l.floorArea, 0) > 0 ? C.num(l.floorArea, 0) : C.num(l.lotArea, 0);
    return base > 0 ? C.num(l.price, 0) / base : 0;
  }
  function listingDisplayPrice(l) {
    if (l.dealType === "rent") return l.rent ? C.money(l.rent) + "<span class='dim' style='font-size:12px'>/mo</span>" : "—";
    return l.price ? C.money(l.price) : "—";
  }
  function listingMainPhoto(l) { return (l.photos && l.photos.length) ? l.photos[0] : ""; }
  function listingCreator(l) {
    if (!l) return "—";
    if (l.createdByName || l.agentName) return l.createdByName || l.agentName;
    const profile = (remoteProfiles || []).find(x => String(x.id) === String(l.createdBy));
    if (profile) return profile.full_name || profile.name || profile.email || l.createdBy;
    if (currentUser && String(currentUser.id) === String(l.createdBy)) return currentUser.name || currentUser.email || l.createdBy;
    return l.createdBy || "—";
  }
  function lsFav(id) { return (state.favorites || []).indexOf(id) >= 0; }
  function lsCityList() {
    const s = new Set();
    (state.listings || []).forEach(l => { if (l.city) s.add(l.city); });
    return Array.from(s).sort();
  }
  function lsLive(l) { return l && l.status !== "sold"; }
  function lsFiltered() {
    const f = state.listingFilters || {};
    let arr = (state.listings || []).slice();
    const q = String(f.q || "").trim().toLowerCase();
    if (q) arr = arr.filter(l => [l.title, l.city, l.province, l.barangay, l.address, l.ref, l.developer].join(" ").toLowerCase().indexOf(q) >= 0);
    if (f.type) arr = arr.filter(l => l.propertyType === f.type);
    if (f.status) arr = arr.filter(l => l.status === f.status);
    if (f.city) arr = arr.filter(l => l.city === f.city);
    if (f.financing) arr = arr.filter(l => (l.financing || []).indexOf(f.financing) >= 0);
    if (C.num(f.minPrice, 0) > 0) arr = arr.filter(l => C.num(l.price, 0) >= C.num(f.minPrice, 0));
    if (C.num(f.maxPrice, 0) > 0) arr = arr.filter(l => C.num(l.price, 0) <= C.num(f.maxPrice, 0));
    if (C.num(f.minBeds, 0) > 0) arr = arr.filter(l => C.num(l.bedrooms, 0) >= C.num(f.minBeds, 0));
    if (C.num(f.minArea, 0) > 0) arr = arr.filter(l => (C.num(l.lotArea, 0) + C.num(l.floorArea, 0)) >= C.num(f.minArea, 0));
    if (f.rfo === "rfo") arr = arr.filter(l => l.status === "rfo");
    if (f.rfo === "pre-selling") arr = arr.filter(l => l.status === "pre-selling");
    if (f.favOnly) arr = arr.filter(l => lsFav(l.id));
    const sort = f.sort || "newest";
    arr.sort((a, b) => {
      if (sort === "price-asc") return C.num(a.price, 0) - C.num(b.price, 0);
      if (sort === "price-desc") return C.num(b.price, 0) - C.num(a.price, 0);
      if (sort === "area-desc") return (C.num(b.lotArea, 0) + C.num(b.floorArea, 0)) - (C.num(a.lotArea, 0) + C.num(a.floorArea, 0));
      if (sort === "price-sqm-asc") return listingPriceSqm(a) - listingPriceSqm(b);
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    return arr;
  }
  function listingCard(l) {
    const img = listingMainPhoto(l);
    const ppsm = listingPriceSqm(l);
    const area = (C.num(l.lotArea, 0) > 0 ? C.num(l.lotArea, 0).toLocaleString() + " sqm" : "") + (C.num(l.floorArea, 0) > 0 ? (C.num(l.lotArea, 0) > 0 ? " · " : "") + C.num(l.floorArea, 0).toLocaleString() + " sqm floor" : "");
    return '<div class="ls-card card card-pad" data-ls-open="' + esc(l.id) + '">' +
      '<div class="ls-photo">' +
        '<div class="ls-photo-ph">' + icon("home", 30) + "<span>" + esc(listTypeLabel(l.propertyType)) + "</span></div>" +
        (img ? '<img class="ls-photo-img" src="' + esc(img) + '" alt="" loading="lazy" onerror="this.remove()">' : "") +
        '<div class="ls-photo-top">' + listStatusBadge(l.status) + (l.isPublished === false ? '<span class="badge gold">Draft</span>' : "") + "</div>" +
        (l.featured ? '<div class="ls-feat">' + icon("star", 12) + " Featured</div>" : "") +
        '<button class="ls-fav' + (lsFav(l.id) ? " on" : "") + '" data-ls-fav="' + esc(l.id) + '" title="Save to favorites">' + icon("star", 17) + "</button>" +
      "</div>" +
      '<div class="ls-body">' +
        '<div class="ls-title">' + esc(l.title || "Untitled listing") + "</div>" +
        '<div class="ls-loc dim">' + icon("pin", 12) + " " + esc([l.city, l.province].filter(Boolean).join(", ") || "Philippines") + "</div>" +
        '<div class="ls-price">' + listingDisplayPrice(l) + (ppsm > 0 ? '<span class="ls-ppsqm">' + C.money(Math.round(ppsm)) + "/sqm</span>" : "") + "</div>" +
        '<div class="ls-meta">' +
          (C.num(l.bedrooms, 0) > 0 ? "<span>" + icon("home", 13) + " " + l.bedrooms + " BR</span>" : "") +
          (C.num(l.bathrooms, 0) > 0 ? "<span>" + icon("target", 13) + " " + l.bathrooms + " BA</span>" : "") +
          (area ? "<span>" + esc(area) + "</span>" : "") +
        "</div>" +
        '<div class="ls-foot"><span class="chip">' + esc(listTypeLabel(l.propertyType)) + "</span><span class='dim tiny'>" + esc(l.ref || "") + "</span>" +
          (roleIs("super-admin") ? '<span class="dim tiny">Created by ' + esc(listingCreator(l)) + "</span>" : "") +
        "</div>" +
      "</div></div>";
  }
  function lsResultsHTML() {
    const arr = lsFiltered();
    if (!arr.length) return '<div class="card card-pad empty">' + icon("search", 40) + "<h3>No listings found</h3><p>Try adjusting your filters, or add a new listing.</p></div>";
    return '<div class="ls-count dim tiny mb-8">' + arr.length + " listing" + (arr.length > 1 ? "s" : "") + "</div><div class='ls-grid'>" + arr.map(listingCard).join("") + "</div>";
  }
  function renderListings() {
    if (state.listingDetail) {
      const l = (state.listings || []).find(x => x.id === state.listingDetail);
      if (l) return renderListingDetail(l);
      state.listingDetail = null;
    }
    const f = state.listingFilters = state.listingFilters || {};
    const can = listingCanManage();
    const opt = (opts, val, allLabel) => '<option value="">' + esc(allLabel || "All") + "</option>" + opts.map(o => '<option value="' + o[0] + '"' + (val === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("");
    const cityOpts = '<option value="">All cities</option>' + lsCityList().map(c => '<option value="' + esc(c) + '"' + (f.city === c ? " selected" : "") + ">" + esc(c) + "</option>").join("");
    let html = '<div class="hero"><div><h1>Listings</h1><p>Browse the brokerage portfolio — filter, save favorites, and manage property listings.</p></div><div class="actions">' +
      (can ? '<button class="btn btn-primary" data-ls-new>' + icon("plus", 15) + " Add Listing</button>" : "") + "</div></div>";
    html += '<div class="card card-pad mb-24" id="ls-filters"><div class="grid grid-4">' +
      '<div class="field"><label>Search</label><input class="input" id="ls-q" type="text" value="' + esc(f.q || "") + '" placeholder="Title, city, developer…"></div>' +
      '<div class="field"><label>Property type</label><select class="input" id="ls-type">' + opt(LISTING_TYPES, f.type) + "</select></div>" +
      '<div class="field"><label>Status</label><select class="input" id="ls-status">' + opt(LISTING_STATUSES, f.status) + "</select></div>" +
      '<div class="field"><label>City / Municipality</label><select class="input" id="ls-city">' + cityOpts + "</select></div>" +
      '<div class="field"><label>Min price (₱)</label><input class="input input-num" id="ls-minp" type="text" inputmode="decimal" value="' + (C.num(f.minPrice, 0) > 0 ? C.fmtNum(f.minPrice) : "") + '" placeholder="0"></div>' +
      '<div class="field"><label>Max price (₱)</label><input class="input input-num" id="ls-maxp" type="text" inputmode="decimal" value="' + (C.num(f.maxPrice, 0) > 0 ? C.fmtNum(f.maxPrice) : "") + '" placeholder="0"></div>' +
      '<div class="field"><label>Min bedrooms</label><input class="input input-num" id="ls-minb" type="text" inputmode="decimal" value="' + (f.minBeds || "") + '" placeholder="0"></div>' +
      '<div class="field"><label>Min area (sqm)</label><input class="input input-num" id="ls-mina" type="text" inputmode="decimal" value="' + (f.minArea || "") + '" placeholder="0"></div>' +
      '<div class="field"><label>Financing accepted</label><select class="input" id="ls-fin">' + opt(LISTING_FINANCING, f.financing) + "</select></div>" +
      '<div class="field"><label>RFO / Pre-Selling</label><select class="input" id="ls-rfo">' + opt([["rfo", "RFO"], ["pre-selling", "Pre-Selling"]], f.rfo) + "</select></div>" +
      '<div class="field"><label>Sort by</label><select class="input" id="ls-sort">' + opt(LISTING_SORTS, f.sort || "newest", "Newest") + "</select></div>" +
      '<div class="field" style="justify-content:flex-end"><label>&nbsp;</label><label class="ms-chk"><input type="checkbox" id="ls-fav"' + (f.favOnly ? " checked" : "") + "> Favorites only</label></div>" +
      "</div></div>";
    html += '<div id="ls-results">' + lsResultsHTML() + "</div>";
    return html;
  }
  function lsStat(label, val) { return '<div class="ls-stat"><div class="ls-stat-v">' + esc(String(val == null || val === "" ? "—" : val)) + '</div><div class="ls-stat-l dim">' + esc(label) + "</div></div>"; }
  function lsDetailRow(k, v) { return "<tr><td>" + esc(k) + "</td><td>" + (v ? esc(String(v)) : "—") + "</td></tr>"; }
  function lsCarouselHTML(l) {
    const photos = (l.photos || []).filter(Boolean);
    const presell = l.status === "pre-selling";
    const badge = listStatusBadge(l.status) + (presell && l.licenseToSell ? '<span class="badge blue">LTS ' + esc(l.licenseToSell) + "</span>" : "");
    if (photos.length < 2) {
      const img = photos[0] || "";
      return '<div class="ls-photo ls-photo-big">' +
        '<div class="ls-photo-ph">' + icon("home", 44) + "<span>" + esc(listTypeLabel(l.propertyType)) + "</span></div>" +
        (img ? '<img class="ls-photo-img" src="' + esc(img) + '" alt="" onerror="this.remove()">' : "") +
        '<div class="ls-photo-top">' + badge + "</div>" +
        "</div>";
    }
    const idx = Math.max(0, Math.min(lsCarIndex, photos.length - 1));
    const slides = photos.map((u, i) => '<div class="ls-car-slide' + (i === idx ? " active" : "") + '"><div class="ls-car-ph">' + icon("home", 40) + "</div>" +
      '<img class="ls-car-img" src="' + esc(u) + '" alt="Photo ' + (i + 1) + '" loading="lazy" onerror="this.remove()"></div>').join("");
    const dots = photos.map((u, i) => '<button type="button" class="ls-car-dot' + (i === idx ? " active" : "") + '" data-ls-car-dot="' + i + '" aria-label="Go to photo ' + (i + 1) + '"></button>').join("");
    return '<div class="ls-carousel" id="ls-carousel">' +
      '<div class="ls-car-track" style="transform:translateX(-' + (idx * 100) + '%)">' + slides + "</div>" +
      '<div class="ls-photo-top ls-car-top">' + badge + "</div>" +
      '<button type="button" class="ls-car-nav ls-car-prev" data-ls-car-prev aria-label="Previous photo">' + icon("back", 18) + "</button>" +
      '<button type="button" class="ls-car-nav ls-car-next" data-ls-car-next aria-label="Next photo">' + icon("arrow", 18) + "</button>" +
      '<div class="ls-car-count">' + (idx + 1) + " / " + photos.length + "</div>" +
      '<div class="ls-car-dots">' + dots + "</div>" +
      "</div>";
  }
  function lsCarGo() {
    const el = $("#ls-carousel");
    if (!el) return;
    const l = (state.listings || []).find(x => x.id === state.listingDetail);
    if (!l) return;
    const photos = (l.photos || []).filter(Boolean);
    const n = photos.length;
    if (n < 2) return;
    const idx = ((lsCarIndex % n) + n) % n;
    lsCarIndex = idx;
    const tr = el.querySelector(".ls-car-track");
    if (tr) tr.style.transform = "translateX(-" + (idx * 100) + "%)";
    el.querySelectorAll(".ls-car-slide").forEach((s, i) => s.classList.toggle("active", i === idx));
    el.querySelectorAll(".ls-car-dot").forEach((d, i) => d.classList.toggle("active", i === idx));
    const c = el.querySelector(".ls-car-count");
    if (c) c.textContent = (idx + 1) + " / " + n;
  }
  function renderListingDetail(l) {
    const can = listingCanEdit(l);
    const ppsm = listingPriceSqm(l);
    const fin = (l.financing || []);
    const presell = l.status === "pre-selling";
    lsCarIndex = Math.max(0, Math.min(lsCarIndex, (l.photos || []).filter(Boolean).length - 1 || 0));
    let html = '<div class="hero"><div><button class="btn btn-ghost btn-sm" data-ls-back>' + icon("back", 13) + ' Back to listings</button><h1 class="mt-8">' + esc(l.title || "Listing") + "</h1>" +
      '<div class="ls-loc dim">' + icon("pin", 13) + " " + esc([l.barangay, l.city, l.province].filter(Boolean).join(", ") || "Philippines") + "</div></div>" +
      '<div class="actions">' +
      '<button class="btn btn-ghost btn-sm" data-ls-fav="' + esc(l.id) + '">' + icon("star", 14) + (lsFav(l.id) ? " Saved" : " Save") + "</button>" +
      (can ? '<button class="btn btn-ghost btn-sm" data-ls-edit="' + esc(l.id) + '">' + icon("edit", 14) + " Edit</button>" +
        '<button class="btn btn-ghost btn-sm" data-ls-del="' + esc(l.id) + '">' + icon("trash", 14) + " Delete</button>" : "") +
      "</div></div>";
    html += '<div class="grid grid-3 mb-24">';
    html += '<div style="grid-column:span 2">' + lsCarouselHTML(l) + "</div>";
    html += '<div class="ls-side card card-pad">' +
      '<div class="ls-price ls-price-big">' + listingDisplayPrice(l) + (ppsm > 0 ? '<div class="ls-ppsqm">' + C.money(Math.round(ppsm)) + " per sqm</div>" : "") + "</div>" +
      '<div class="ls-stats">' + lsStat("Bedrooms", l.bedrooms) + lsStat("Bathrooms", l.bathrooms) + lsStat("Parking", l.parking) + lsStat("Floors", l.floors) + "</div>" +
      '<div class="ls-stats">' + lsStat("Lot area", l.lotArea ? C.num(l.lotArea, 0).toLocaleString() + " sqm" : "—") + lsStat("Floor area", l.floorArea ? C.num(l.floorArea, 0).toLocaleString() + " sqm" : "—") + lsStat("Turnover", l.turnoverDate || "—") + lsStat("Status", listStatusLabel(l.status)) + "</div>";
    if (fin.length) html += '<div class="mt-16"><label class="ls-sublabel">Financing accepted</label><div class="chip-row">' + fin.map(x => '<span class="chip">' + esc((LISTING_FINANCING.find(z => z[0] === x) || [x, x])[1]) + "</span>").join("") + "</div></div>";
    if (l.developer) html += '<div class="mt-8"><label class="ls-sublabel">Developer / Broker</label><div>' + esc(l.developer) + "</div></div>";
    if (l.hoaDues || l.condoDues) html += '<div class="mt-8"><label class="ls-sublabel">Association / Condo dues</label><div>' + (l.hoaDues ? "HOA " + C.money(l.hoaDues) + "/mo" : "") + (l.condoDues ? (l.hoaDues ? " · " : "") + "Condo " + C.money(l.condoDues) + "/mo" : "") + "</div></div>";
    html += "</div></div>";
    html += '<div class="grid grid-3 mb-24">';
    html += '<div class="card card-pad" style="grid-column:span 2">' +
      (l.description ? "<h3>Description</h3><p class='dim mt-8'>" + esc(l.description) + "</p>" : "") +
      '<h3 class="mt-16">Property Details</h3><div class="table-wrap mt-8"><table class="data"><tbody>' +
        lsDetailRow("Listing Ref", l.ref) +
        (roleIs("super-admin") ? lsDetailRow("Created by", listingCreator(l)) : "") +
        lsDetailRow("Property Type", listTypeLabel(l.propertyType)) +
        lsDetailRow("Deal Type", l.dealType === "rent" ? "For Rent" : "For Sale") +
        lsDetailRow("Location", [l.address, l.barangay, l.city, l.province].filter(Boolean).join(", ")) +
        lsDetailRow("Title Type", (LISTING_TITLES.find(x => x[0] === l.titleType) || [0, "—"])[1]) +
        lsDetailRow("Title No.", l.titleNo) +
        lsDetailRow("Tax Declaration No.", l.taxDecNo) +
        lsDetailRow("Zoning Classification", l.zoning) +
        lsDetailRow("Turnover Date", l.turnoverDate) +
        (presell ? lsDetailRow("DHSUD License to Sell", l.licenseToSell || "Pending") : "") +
        (safeHttpsUrl(l.videoUrl) ? '<tr><td>Virtual Tour</td><td><a href="' + esc(safeHttpsUrl(l.videoUrl)) + '" target="_blank" rel="noopener">Watch video</a></td></tr>' : "") +
      "</tbody></table></div></div>";
    html += '<div class="card card-pad"><h3>Location</h3><div id="ls-static-map" class="ls-map mt-8"></div></div>';
    html += "</div>";
    html += l.isPublished === false
      ? '<div class="notice-banner mt-16">This is a private draft preview. Publish the listing to enable public inquiries.</div>'
      : listingInquiryForm(l);
    html += '<div class="notice-banner">' + icon("shield", 14) + ' <span>Prices and monthly dues are marketing estimates for reference only. Verify title, zoning, and association dues with the developer or Registry of Deeds before transacting. This system does not provide legal or tax advice.</span></div>';
    return html;
  }
  function initListingStaticMap(id, lat, lng) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!window.L) { window.ESREALTY_LEAFLET.ensure().then(() => initListingStaticMap(id, lat, lng)); return; }
    const latN = parseFloat(lat), lngN = parseFloat(lng);
    if (!isFinite(latN) || !isFinite(lngN)) { el.innerHTML = '<div class="dim">No map pin set for this listing.</div>'; return; }
    const dark = (document.documentElement.getAttribute("data-theme") || "dark") === "dark";
    const tiles = dark ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    try {
      const map = L.map(id, { center: [latN, lngN], zoom: 15, scrollWheelZoom: false });
      L.tileLayer(tiles, { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: "abcd", maxZoom: 19 }).addTo(map);
      L.marker([latN, lngN]).addTo(map);
      setTimeout(() => { try { map.invalidateSize(); } catch (e) { /* noop */ } }, 120);
    } catch (e) { /* noop */ }
  }
  async function toggleFavorite(id) {
    if (!currentUser) { showAuth(); return; }
    try {
      let saved;
      if (IS_LOCAL_DEV && !currentUser.registrationStatus) saved = !lsFav(id);
      else {
        if (!LISTINGS_API) throw new Error("Listings API is unavailable");
        saved = Boolean((await LISTINGS_API.toggleFavorite(id)).saved);
      }
      if (!state.favorites) state.favorites = [];
      state.favorites = state.favorites.filter(x => x !== id);
      if (saved) state.favorites.push(id);
      const listing = (state.listings || []).find(x => x.id === id);
      cloudSavedListings = cloudSavedListings.filter(x => x.id !== id);
      if (saved && listing) cloudSavedListings.unshift(listing);
      save();
      toast(saved ? "Saved to favorites" : "Removed from favorites", saved ? "" : "err");
      render();
    } catch (e) { toast("Could not update favorites: " + esc(friendlyErr(e.message)), "err"); }
  }
  async function lsDelete(id) {
    const l = (state.listings || []).find(x => x.id === id);
    if (!l) return;
    if (!listingCanEdit(l)) { toast("You can only delete listings owned by your account", "err"); return; }
    if (!confirm('Delete listing "' + (l.title || "") + '"?')) return;
    try {
      if (!(IS_LOCAL_DEV && !currentUser.registrationStatus)) await deleteListingFromCloud(id);
      state.listings = state.listings.filter(x => x.id !== id);
      cloudMyListings = cloudMyListings.filter(x => x.id !== id);
      cloudSavedListings = cloudSavedListings.filter(x => x.id !== id);
      state.favorites = (state.favorites || []).filter(x => x !== id);
      if (state.listingDetail === id) state.listingDetail = null;
      save(); render(); toast("Listing deleted", "err");
    } catch (e) { toast("Could not delete listing: " + esc(friendlyErr(e.message)), "err"); }
  }
  function lsSelOpt(opts, val) { return opts.map(o => '<option value="' + o[0] + '"' + (val === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>").join(""); }
  function lsFld(label, inner, hint) { return '<div class="field"><label>' + label + "</label>" + inner + (hint ? '<div class="field-hint">' + hint + "</div>" : "") + "</div>"; }
  function lsGeoProvinces(region) { const p = PH_GEO[region] || {}; return Object.keys(p); }
  function lsGeoCities(region, province) { const p = PH_GEO[region] || {}; return (p[province] || []); }
  const PH_GEO_ALIAS = {
    "Calabarzon": "Region IV-A - CALABARZON", "CALABARZON": "Region IV-A - CALABARZON",
    "Central Luzon": "Region III - Central Luzon", "Bicol Region": "Region V - Bicol Region",
    "Central Visayas": "Region VII - Central Visayas", "Western Visayas": "Region VI - Western Visayas",
    "Eastern Visayas": "Region VIII - Eastern Visayas", "Northern Mindanao": "Region X - Northern Mindanao",
    "Davao Region": "Region XI - Davao Region", "SOCCSKSARGEN": "Region XII - SOCCSKSARGEN",
    "Bangsamoro": "BARMM", "Ilocos Region": "Region I - Ilocos Region", "Cagayan Valley": "Region II - Cagayan Valley",
    "MIMAROPA": "Region IV-B - MIMAROPA", "Zamboanga Peninsula": "Region IX - Zamboanga Peninsula", "Caraga": "Region XIII - Caraga"
  };
  function lsGeoNormRegion(r) { return (PH_GEO_ALIAS[r] || r || ""); }
  function lsGeoOpts(list, val) {
    let html = list.map(v => '<option value="' + esc(v) + '"' + (val === v ? " selected" : "") + ">" + esc(v) + "</option>").join("");
    if (val && list.indexOf(val) < 0) html = '<option value="' + esc(val) + '" selected>' + esc(val) + "</option>" + html;
    return html || '<option value="">—</option>';
  }
  function lsGeoPop(regId, provId, cityId) {
    const reg = document.getElementById(regId), prov = document.getElementById(provId), city = document.getElementById(cityId);
    if (!reg || !prov || !city) return;
    const provinces = lsGeoProvinces(reg.value);
    const keepProv = provinces.indexOf(prov.value) >= 0;
    const newProv = keepProv ? prov.value : (provinces[0] || "");
    prov.innerHTML = lsGeoOpts(provinces, newProv);
    const cities = lsGeoCities(reg.value, newProv);
    const keepCity = keepProv && cities.indexOf(city.value) >= 0;
    city.innerHTML = lsGeoOpts(cities, keepCity ? city.value : (cities[0] || ""));
  }
  function lsTxt(id, v, ph) { return '<input class="input" id="' + id + '" type="text" value="' + esc(v == null ? "" : v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + ">"; }
  function lsNum(id, v) { return '<input class="input input-num" id="' + id + '" type="text" inputmode="decimal" value="' + (C.num(v, 0) > 0 ? C.fmtNum(v) : "") + '" placeholder="0">'; }
  function lsPhotoThumb(url) {
    return '<div class="ls-photo-thumb"><img src="' + esc(url) + '" alt="Photo" loading="lazy"><button type="button" class="ls-photo-remove" data-ls-photo-remove title="Remove photo">&times;</button></div>';
  }
  async function lsUploadPhotos(files) {
    if (!SB || !SB.storage || !currentUser || !currentUser.id) { toast("Sign in to upload photos", "err"); return; }
    const list = Array.from(files || []).filter(f => /^image\//.test(f.type || ""));
    if (!list.length) { toast("Choose a JPG, PNG or WebP image", "err"); return; }
    const status = $("#ls-photo-status");
    if (status) status.textContent = "Uploading " + list.length + " photo" + (list.length === 1 ? "" : "s") + "…";
    let done = 0;
    for (const file of list) {
      if (file.size > 4 * 1024 * 1024) { toast(esc(file.name) + " is larger than 4 MB", "err"); done += 1; continue; }
      const ext = (file.name.match(/\.([a-zA-Z0-9]+)$/) || [, "jpg"])[1].toLowerCase();
      const path = currentUser.id + "/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.floor(Math.random() * 1e9)) + "." + ext;
      try {
        const { error } = await SB.storage.from("listing-photos").upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        const { data } = SB.storage.from("listing-photos").getPublicUrl(path);
        const url = data && data.publicUrl ? data.publicUrl : "";
        if (!url) throw new Error("Could not build the photo URL");
        const ta = $("#ls-photos");
        if (ta) {
          const lines = ta.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          lines.push(url);
          ta.value = lines.join("\n");
        }
        const previews = $("#ls-photo-previews");
        if (previews) previews.insertAdjacentHTML("beforeend", lsPhotoThumb(url));
        toast("Uploaded " + esc(file.name));
      } catch (e) {
        toast("Upload failed: " + esc(friendlyErr(e.message || "Unknown error")), "err");
      } finally {
        done += 1;
        if (status) status.textContent = done < list.length ? "Uploading " + (done + 1) + "/" + list.length + "…" : "";
      }
    }
  }
  function openListingEditor(id) {
    if (!listingCanManage()) { toast("You don't have permission to manage listings", "err"); return; }
    closeLstModal();
    const l = id ? (state.listings || []).find(x => x.id === id) || {} : {};
    if (id && !listingCanEdit(l)) { toast("You can only edit listings owned by your account", "err"); return; }
    const fin = l.financing && l.financing.length ? l.financing : ["cash"];
    const finChk = LISTING_FINANCING.map(o => '<label class="ms-chk"><input type="checkbox" data-ls-fin value="' + o[0] + '"' + (fin.indexOf(o[0]) >= 0 ? " checked" : "") + "> " + esc(o[1]) + "</label>").join("");
    const gReg = lsGeoNormRegion(l.region) || Object.keys(PH_GEO)[0];
    const gProv = l.province || (lsGeoProvinces(gReg)[0] || "");
    const gCity = l.city || (lsGeoCities(gReg, gProv)[0] || "");
    const body =
      '<div class="grid grid-2">' +
        lsFld("Listing title *", lsTxt("ls-title", l.title, "e.g. 3BR House & Lot in Imus")) +
        lsFld("Property type", '<select class="input" id="ls-type">' + lsSelOpt(LISTING_TYPES, l.propertyType || "house-and-lot") + "</select>") +
        lsFld("Deal type", '<select class="input" id="ls-deal">' + lsSelOpt([["sale", "For Sale"], ["rent", "For Rent"]], l.dealType || "sale") + "</select>") +
        lsFld("Status", '<select class="input" id="ls-status">' + lsSelOpt(LISTING_STATUSES, l.status || "available") + "</select>") +
        lsFld("Price (₱)", lsNum("ls-price", l.price)) +
        lsFld("Monthly rent (₱)", lsNum("ls-rent", l.rent)) +
        lsFld("Lot area (sqm)", lsNum("ls-lot", l.lotArea)) +
        lsFld("Floor area (sqm)", lsNum("ls-floor", l.floorArea)) +
        lsFld("Bedrooms", lsNum("ls-beds", l.bedrooms)) +
        lsFld("Bathrooms", lsNum("ls-baths", l.bathrooms)) +
        lsFld("Parking slots", lsNum("ls-park", l.parking)) +
        lsFld("Floors", lsNum("ls-floors", l.floors)) +
        lsFld("Region", '<select class="input" id="ls-m-region">' + lsGeoOpts(Object.keys(PH_GEO), gReg) + "</select>") +
        lsFld("Province", '<select class="input" id="ls-m-province">' + lsGeoOpts(lsGeoProvinces(gReg), gProv) + "</select>") +
        lsFld("City / Municipality", '<select class="input" id="ls-m-city">' + lsGeoOpts(lsGeoCities(gReg, gProv), gCity) + "</select>") +
        lsFld("Barangay", lsTxt("ls-brgy", l.barangay)) +
        lsFld("Street address", lsTxt("ls-addr", l.address)) +
        lsFld("Title type", '<select class="input" id="ls-titletype">' + lsSelOpt(LISTING_TITLES, l.titleType || "tct") + "</select>") +
        lsFld("Title No.", lsTxt("ls-title-no", l.titleNo)) +
        lsFld("Tax Declaration No.", lsTxt("ls-taxdec", l.taxDecNo)) +
        lsFld("Zoning classification", '<select class="input" id="ls-zoning">' + lsSelOpt(LISTING_ZONING, (l.zoning || "residential").toLowerCase()) + "</select>") +
        lsFld("Turnover date (RFO/pre-selling)", lsTxt("ls-turnover", l.turnoverDate, "e.g. Q4 2027")) +
        lsFld("Developer / Broker", lsTxt("ls-developer", l.developer)) +
        lsFld("DHSUD License to Sell", lsTxt("ls-lts", l.licenseToSell), "Required for pre-selling projects") +
        lsFld("HOA dues (₱/mo)", lsNum("ls-hoa", l.hoaDues)) +
        lsFld("Condo dues (₱/mo)", lsNum("ls-condo", l.condoDues)) +
      "</div>" +
      '<div class="field col-full mt-8"><label>Financing accepted</label><div class="chip-row">' + finChk + "</div></div>" +
      '<div class="field col-full mt-8"><label>Description</label><textarea class="input" id="ls-desc" rows="4" placeholder="Highlights, nearby landmarks, etc.">' + esc(l.description || "") + "</textarea></div>" +
      '<div class="field col-full mt-8"><label>Photos</label>' +
        '<div class="ls-photo-toolbar"><label class="btn btn-ghost btn-sm" style="margin:0">' + icon("upload", 14) + ' Upload photos<input type="file" id="ls-photo-files" style="display:none" accept="image/*" multiple></label>' +
        '<span class="field-hint" id="ls-photo-status" style="align-self:center"></span></div>' +
        '<div id="ls-photo-previews" class="ls-photo-previews">' + (l.photos || []).map(lsPhotoThumb).join("") + "</div>" +
        '<textarea class="input mt-8" id="ls-photos" rows="3" placeholder="https://… or use the upload button">' + esc((l.photos || []).join("\n")) + "</textarea>" +
        '<div class="field-hint">JPG, PNG or WebP · up to 4 MB each · uploads are public.</div></div>' +
      '<div class="field col-full mt-8"><label>Virtual tour / video URL</label>' + lsTxt("ls-video", l.videoUrl) + "</div>" +
      '<div class="field col-full mt-8"><label>Featured listing</label><label class="ms-chk"><input type="checkbox" id="ls-feat"' + (l.featured ? " checked" : "") + "> Show as featured</label></div>" +
      '<div class="field col-full mt-8"><label>Publication</label><label class="ms-chk"><input type="checkbox" id="ls-published"' + (l.isPublished ? " checked" : "") + '> Publish on the public property website</label><div class="field-hint">Leave unchecked to keep this listing as a private draft.</div></div>' +
      '<div class="field col-full mt-8"><label>Pin on map</label>' +
        '<div class="row" style="align-items:center;gap:8px"><input class="input" id="ls-map-q" type="text" placeholder="Search address / place" style="flex:1"><button class="btn btn-ghost btn-sm" id="ls-map-btn" type="button">' + icon("search", 14) + " Find</button></div>" +
        '<div id="ls-map" class="ls-map ls-map-edit mt-8"></div>' +
        '<div id="ls-map-coords" class="field-hint"></div>' +
        '<input type="hidden" id="ls-lat" value="' + esc(l.lat || "") + '"><input type="hidden" id="ls-lng" value="' + esc(l.lng || "") + '">' +
      "</div>";
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "ls-modal";
    ov.setAttribute("data-edit-id", id || "");
    ov.innerHTML = '<div class="modal-card modal-card-wide"><div class="modal-head"><h3>' + (id ? "Edit Listing" : "Add Listing") + '</h3><button class="icon-btn" data-ls-cancel title="Close">&times;</button></div>' +
      '<div class="modal-body" style="max-height:70vh;overflow:auto">' + body + "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-ls-cancel>Cancel</button><button class="btn btn-primary" data-ls-save>' + icon("check", 15) + " Save Listing</button></div></div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeLstModal(); });
    initMapPicker("ls-map", l.lat, l.lng, (la, lo) => { const el1 = $("#ls-lat"); const el2 = $("#ls-lng"); if (el1 && el2) { el1.value = la; el2.value = lo; } }, l.address || [l.city, l.province].filter(Boolean).join(", "));
  }
  function closeLstModal() { const m = $("#ls-modal"); if (m) m.remove(); }
  async function lsSaveForm() {
    if (!listingCanManage()) { toast("You don't have permission to manage listings", "err"); return; }
    const $v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const $n = id => { const el = document.getElementById(id); return el ? C.num(el.value, 0) : 0; };
    const title = $v("ls-title");
    if (!title) { toast("Listing title is required", "err"); return; }
    const m = $("#ls-modal");
    const editId = m ? (m.getAttribute("data-edit-id") || "") : "";
    const rec = editId ? Object.assign({}, (state.listings || []).find(x => x.id === editId) || {}) : {};
    if (editId && !listingCanEdit(rec)) { toast("You can only edit listings owned by your account", "err"); return; }
    const fin = [];
    $$("[data-ls-fin]").forEach(c => { if (c.checked) fin.push(c.value); });
    if (!fin.length) fin.push("cash");
    rec._isNew = !editId;
    rec.id = rec.id || ("lst-" + Date.now() + "-" + Math.floor(Math.random() * 1000));
    rec.ref = rec.ref || "";
    rec.title = title;
    rec.propertyType = $v("ls-type") || "house-and-lot";
    rec.dealType = $v("ls-deal") || "sale";
    rec.status = $v("ls-status") || "available";
    rec.price = $n("ls-price");
    rec.rent = $n("ls-rent");
    rec.lotArea = $n("ls-lot");
    rec.floorArea = $n("ls-floor");
    rec.bedrooms = $n("ls-beds");
    rec.bathrooms = $n("ls-baths");
    rec.parking = $n("ls-park");
    rec.floors = $n("ls-floors");
    rec.region = $v("ls-m-region"); rec.province = $v("ls-m-province"); rec.city = $v("ls-m-city"); rec.barangay = $v("ls-brgy"); rec.address = $v("ls-addr");
    rec.titleType = $v("ls-titletype"); rec.titleNo = $v("ls-title-no"); rec.taxDecNo = $v("ls-taxdec"); rec.zoning = $v("ls-zoning");
    rec.turnoverDate = $v("ls-turnover"); rec.developer = $v("ls-developer"); rec.licenseToSell = $v("ls-lts");
    rec.hoaDues = $n("ls-hoa"); rec.condoDues = $n("ls-condo");
    rec.financing = fin;
    rec.description = $v("ls-desc");
    rec.photos = $v("ls-photos").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    rec.videoUrl = $v("ls-video");
    rec.featured = $("#ls-feat") ? $("#ls-feat").checked : false;
    rec.isPublished = $("#ls-published") ? $("#ls-published").checked : false;
    rec.lat = $v("ls-lat"); rec.lng = $v("ls-lng");
    rec.updatedAt = new Date().toISOString();
    if (!rec.createdAt) rec.createdAt = rec.updatedAt;
    if (!rec.createdBy) rec.createdBy = currentUser && currentUser.id;
    const saveButton = document.querySelector("[data-ls-save]");
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Saving…"; }
    try {
      if (!(IS_LOCAL_DEV && !currentUser.registrationStatus)) {
        const saved = await persistListingToCloud(rec);
        if (saved) { rec.id = saved.id || rec.id; rec.ref = saved.ref || rec.ref; rec.createdBy = saved.owner_id || rec.createdBy; }
      }
      delete rec._isNew;
      if (!state.listings) state.listings = [];
      const idx = state.listings.findIndex(x => x.id === (editId || rec.id));
      if (idx >= 0) state.listings[idx] = rec; else state.listings.unshift(rec);
      cloudMyListings = cloudMyListings.filter(x => x.id !== rec.id);
      cloudMyListings.unshift(rec);
      syncTransactionsToListings();
      closeLstModal(); save(); render();
      toast(rec.isPublished ? (editId ? "Listing updated and published" : "Listing published") : "Draft saved");
    } catch (e) {
      if (saveButton) { saveButton.disabled = false; saveButton.innerHTML = icon("check", 15) + " Save Listing"; }
      toast("Could not save listing: " + esc(friendlyErr(e.message)), "err");
    }
  }
  let lsHooked = false;
  function bindListings() {
    if (!lsHooked) {
      lsHooked = true;
      document.addEventListener("click", e => {
        const fav = e.target.closest("[data-ls-fav]");
        if (fav) { toggleFavorite(fav.getAttribute("data-ls-fav")); return; }
        const open = e.target.closest("[data-ls-open]");
        if (open) { state.listingDetail = open.getAttribute("data-ls-open"); if (state.view === "dashboard") state.view = "listings"; lsStatBump(state.listingDetail, "views"); lsCarIndex = 0; save(); render(); return; }
        const back = e.target.closest("[data-ls-back]");
        if (back) { state.listingDetail = null; lsCarIndex = 0; save(); render(); return; }
        const carPrev = e.target.closest("[data-ls-car-prev]");
        if (carPrev) { const pl = (state.listings || []).find(x => x.id === state.listingDetail); const pn = (pl && pl.photos || []).filter(Boolean).length; if (pn > 1) { lsCarIndex--; lsCarGo(); } return; }
        const carNext = e.target.closest("[data-ls-car-next]");
        if (carNext) { const nl = (state.listings || []).find(x => x.id === state.listingDetail); const nn = (nl && nl.photos || []).filter(Boolean).length; if (nn > 1) { lsCarIndex++; lsCarGo(); } return; }
        const carDot = e.target.closest("[data-ls-car-dot]");
        if (carDot) { lsCarIndex = parseInt(carDot.getAttribute("data-ls-car-dot"), 10) || 0; lsCarGo(); return; }
        const nw = e.target.closest("[data-ls-new]");
        if (nw) { openListingEditor(); return; }
        const ed = e.target.closest("[data-ls-edit]");
        if (ed) { openListingEditor(ed.getAttribute("data-ls-edit")); return; }
        const del = e.target.closest("[data-ls-del]");
        if (del) { lsDelete(del.getAttribute("data-ls-del")); return; }
        const saveBtn = e.target.closest("[data-ls-save]");
        if (saveBtn) { lsSaveForm(); return; }
        const cancel = e.target.closest("[data-ls-cancel]");
        if (cancel) { closeLstModal(); return; }
        const inquire = e.target.closest("[data-ls-inquire]");
        if (inquire) { submitListingInquiry(inquire.getAttribute("data-ls-inquire")); return; }
        const copy = e.target.closest("[data-ls-copylink]");
        if (copy) { copyListingText(location.href, "Listing link copied"); return; }
        const marketCopy = e.target.closest("[data-ls-mktcopy]");
        if (marketCopy) {
          const l = (state.listings || []).find(x => x.id === state.listingDetail);
          if (l) copyListingText(listingMarketCopy(l), "Marketplace post copied");
          return;
        }
      });
      document.addEventListener("change", e => {
        const rg = e.target.closest("#ls-m-region");
        if (rg) { lsGeoPop("ls-m-region", "ls-m-province", "ls-m-city"); return; }
        const pv = e.target.closest("#ls-m-province");
        if (pv) { lsGeoPop("ls-m-region", "ls-m-province", "ls-m-city"); return; }
        const files = e.target.closest("#ls-photo-files");
        if (files && files.files && files.files.length) { lsUploadPhotos(files.files); files.value = ""; return; }
      });
      document.addEventListener("click", e => {
        const remove = e.target.closest("[data-ls-photo-remove]");
        if (remove) {
          const thumb = remove.closest(".ls-photo-thumb");
          const img = thumb && thumb.querySelector("img");
          const url = img ? (img.getAttribute("src") || "") : "";
          const ta = $("#ls-photos");
          if (ta && url) {
            ta.value = ta.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).filter(u => u !== url).join("\n");
          }
          if (thumb) thumb.remove();
          return;
        }
      });
    }
    if (state.listingDetail) {
      const l = (state.listings || []).find(x => x.id === state.listingDetail);
      if (l) initListingStaticMap("ls-static-map", l.lat, l.lng);
      return;
    }
    const f = state.listingFilters = state.listingFilters || {};
    const bind = (id, key, evt) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(evt || "change", () => {
        state.listingFilters[key] = el.value;
        save();
        const res = $("#ls-results");
        if (res) res.innerHTML = lsResultsHTML();
      });
    };
    bind("ls-q", "q", "input");
    bind("ls-type", "type"); bind("ls-status", "status"); bind("ls-city", "city"); bind("ls-fin", "financing");
    bind("ls-minp", "minPrice", "input"); bind("ls-maxp", "maxPrice", "input"); bind("ls-minb", "minBeds", "input"); bind("ls-mina", "minArea", "input");
    bind("ls-rfo", "rfo"); bind("ls-sort", "sort");
    const fav = document.getElementById("ls-fav");
    if (fav) fav.addEventListener("change", () => { state.listingFilters.favOnly = fav.checked; save(); const res = $("#ls-results"); if (res) res.innerHTML = lsResultsHTML(); });
  }
  function ensureListings() {
    if (!state.listings) state.listings = [];
    if (!state.favorites) state.favorites = [];
    if (!state.listingFilters) state.listingFilters = {};
  }

  /* ================= CRM / LEADS ================= */
  const LEAD_TYPES = [["buyer", "Buyer"], ["seller", "Seller"], ["renter", "Renter"], ["investor", "Investor"]];
  const LEAD_STATUSES = [["new", "New", "blue"], ["contacted", "Contacted", "gold"], ["site-visit", "Site Visit", "cyan"], ["offer", "Offer Submitted", "purple"], ["negotiation", "Negotiating", "gold"], ["closed", "Closed / Won", "green"], ["lost", "Lost", "red"]];
  const CAL_EVENT_TYPES = [["showing", "Property showing", "cyan"], ["follow-up", "Lead follow-up", "blue"], ["meeting", "Client meeting", "purple"], ["offer", "Offer deadline", "gold"], ["closing", "Closing / turnover", "green"], ["documents", "Document deadline", "red"]];
  const LEAD_SOURCES = [["listing", "Listing Inquiry"], ["referral", "Referral"], ["walk-in", "Walk-in"], ["facebook", "Facebook"], ["website", "Website"], ["market", "Market Scan"], ["other", "Other"]];
  const LEAD_PIPELINE = ["new", "contacted", "site-visit", "offer", "negotiation", "closed"];
  function leadStatusCfg(v) { return LEAD_STATUSES.find(x => x[0] === v); }
  function leadTypeLabel(v) { const f = LEAD_TYPES.find(x => x[0] === v); return f ? f[1] : (v || "—"); }
  function leadSourceLabel(v) { const f = LEAD_SOURCES.find(x => x[0] === v); return f ? f[1] : (v || "—"); }
  function leadStatusBadge(v) { const c = leadStatusCfg(v) || ["", v, "blue"]; return '<span class="badge ' + c[2] + '">' + esc(c[1]) + "</span>"; }
  function leadCanManage() { return can("leads.manage"); }
  function leadCanEdit(l) {
    if (!leadCanManage()) return false;
    if (currentUser && currentUser.demo) return true;
    if (roleIs("super-admin")) return !!(currentUser && currentUser.id && l && l.createdBy && String(l.createdBy) === String(currentUser.id));
    if (userRole() !== "broker") return true;
    return !!(currentUser && currentUser.id && l && l.createdBy && String(l.createdBy) === String(currentUser.id));
  }
  function leadInitials(name) { return String(name || "?").split(/\s+/).map(w => w.charAt(0)).slice(0, 2).join("").toUpperCase(); }
  function leadAvatar(name, size) { return '<div class="lead-avatar" style="width:' + (size || 34) + 'px;height:' + (size || 34) + 'px;font-size:' + (size ? Math.round(size * 0.4) : 13) + 'px">' + esc(leadInitials(name)) + "</div>"; }
  function leadBudget(l) {
    if (l.type === "seller") return l.askingPrice ? C.money(l.askingPrice) : "—";
    if (l.type === "renter") return l.rentBudget ? C.money(l.rentBudget) + "<span class='dim tiny'>/mo</span>" : "—";
    return l.budget ? C.money(l.budget) : "—";
  }
  function leadDaysSince(l) {
    const d = new Date(l.updatedAt || l.createdAt || Date.now());
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return days <= 0 ? "today" : (days === 1 ? "1d ago" : days + "d ago");
  }
  let brokerTeamCache = null;
  let brokerTeamList = [];
  let brokerTeamStatus = "idle";
  let linkedBroker = null;
  let linkedBrokerStatus = "idle";
  function brokerTeamMembers() {
    if (currentUser && currentUser.demo) {
      const brokerRec = (state.users || []).find(u => u.role === "broker");
      if (!brokerRec) return [];
      const members = (state.users || []).filter(u => u.role === "agent" && u.active !== false && u.broker === brokerRec.id)
        .map(u => ({ id: u.id, name: (u.name || "").trim(), email: u.email || "" }));
      const me = (currentUser && currentUser.name || "").trim();
      if (me && !members.find(m => m.name === me)) members.push({ id: "", name: me, email: currentUser.email || "" });
      return members.filter(m => m.name);
    }
    return brokerTeamList;
  }
  function brokerTeamNames() {
    if (userRole() !== "broker") return null;
    const members = brokerTeamMembers();
    return members.map(m => m.name);
  }
  function agentLinkedBroker() {
    if (userRole() !== "agent") return null;
    if (currentUser && currentUser.demo) {
      const rec = (state.users || []).find(u => u.role === "broker" && u.active !== false);
      return rec ? { id: rec.id, name: rec.name || "", email: rec.email || "", agency: rec.agency || "", prc: rec.prc || "" } : null;
    }
    return linkedBroker;
  }
  async function loadBrokerTeam() {
    if (!currentUser || currentUser.demo) {
      brokerTeamCache = null; brokerTeamList = [];
      brokerTeamStatus = currentUser && userRole() === "broker" ? "ready" : "idle";
      linkedBroker = null;
      linkedBrokerStatus = currentUser && userRole() === "agent" ? "ready" : "idle";
      return;
    }
    if (userRole() === "agent") {
      brokerTeamCache = null; brokerTeamList = []; brokerTeamStatus = "idle";
      if (!SB || !currentUser.id) { linkedBrokerStatus = "error"; return; }
      linkedBrokerStatus = "loading";
      try {
        const res = await SB.rpc("my_broker");
        if (res.error) throw res.error;
        const row = res.data && !Array.isArray(res.data) ? res.data : null;
        linkedBroker = row && row.id ? { id: row.id, name: String(row.full_name || row.name || "").trim(), email: row.email || "", agency: row.agency || "", prc: row.prc || "" } : null;
        linkedBrokerStatus = "ready";
      } catch (e) {
        linkedBroker = null;
        linkedBrokerStatus = "error";
      }
      if (state.view === "leads") render();
      return;
    }
    linkedBroker = null;
    linkedBrokerStatus = "idle";
    if (userRole() !== "broker") { brokerTeamCache = null; brokerTeamList = []; brokerTeamStatus = "idle"; return; }
    if (!SB || !currentUser.id) { brokerTeamStatus = "error"; return; }
    brokerTeamStatus = "loading";
    try {
      const res = await SB.rpc("broker_team");
      if (res.error) throw res.error;
      brokerTeamList = (Array.isArray(res.data) ? res.data : []).map(r => ({ id: r.id, name: String(r.full_name || r.name || "").trim(), email: r.email || "" })).filter(m => m.name);
      brokerTeamCache = brokerTeamList.map(m => m.name);
      brokerTeamStatus = "ready";
    } catch (e) {
      brokerTeamCache = [];
      brokerTeamList = [];
      brokerTeamStatus = "error";
    }
    if (state.view === "leads") render();
  }
  let cloudListingsReady = null;
  let cloudSavedListings = [];
  let cloudMyListings = [];
  function listingFromApi(row) {
    const payload = row && row.payload && typeof row.payload === "object" ? row.payload : {};
    const images = Array.isArray(row && row.images) ? row.images.map(x => typeof x === "string" ? x : x.url).filter(Boolean) : (Array.isArray(payload.photos) ? payload.photos : []);
    return Object.assign({}, payload, {
      id: row.id || payload.id,
      ref: row.ref || payload.ref || "",
      title: row.title || payload.title || "",
      description: row.description != null ? row.description : (payload.description || ""),
      propertyType: row.property_type || payload.propertyType || "house-and-lot",
      dealType: row.offer_type || payload.dealType || "sale",
      status: row.status || payload.status || "available",
      price: Number(row.price != null ? row.price : payload.price || 0),
      rent: Number(row.rent != null ? row.rent : payload.rent || 0),
      address: row.address != null ? row.address : (payload.address || ""),
      barangay: row.barangay != null ? row.barangay : (payload.barangay || ""),
      city: row.city != null ? row.city : (payload.city || ""),
      province: row.province != null ? row.province : (payload.province || ""),
      region: row.region != null ? row.region : (payload.region || ""),
      postalCode: row.postal_code != null ? row.postal_code : (payload.postalCode || ""),
      lat: row.latitude != null ? String(row.latitude) : (payload.lat || ""),
      lng: row.longitude != null ? String(row.longitude) : (payload.lng || ""),
      agentId: row.agent_id || payload.agentId || "",
      agentName: row.agent_name || payload.agentName || "",
      createdByName: row.agent_name || payload.createdByName || "",
      bedrooms: Number(row.bedrooms != null ? row.bedrooms : payload.bedrooms || 0),
      bathrooms: Number(row.bathrooms != null ? row.bathrooms : payload.bathrooms || 0),
      floorArea: Number(row.floor_area_sqm != null ? row.floor_area_sqm : payload.floorArea || 0),
      lotArea: Number(row.lot_size_sqm != null ? row.lot_size_sqm : payload.lotArea || 0),
      yearBuilt: row.year_built != null ? Number(row.year_built) : (payload.yearBuilt || null),
      featured: Boolean(row.featured != null ? row.featured : payload.featured),
      isPublished: Boolean(row.is_published != null ? row.is_published : row.published_at),
      createdBy: row.owner_id || row.agent_id || payload.createdBy || "",
      createdAt: row.created_at || row.published_at || payload.createdAt || "",
      updatedAt: row.updated_at || payload.updatedAt || "",
      views: Number(row.views || 0),
      inquiries: Number(row.inquiries || 0),
      photos: images
    });
  }
  function listingToApi(rec) {
    return {
      ref: rec.ref || "",
      title: rec.title || "",
      description: rec.description || "",
      property_type: rec.propertyType || "house-and-lot",
      offer_type: rec.dealType || "sale",
      status: rec.status || "available",
      price: Number(rec.price || 0),
      rent: Number(rec.rent || 0),
      address: rec.address || "",
      barangay: rec.barangay || "",
      city: rec.city || "",
      province: rec.province || "",
      region: rec.region || "",
      postal_code: rec.postalCode || "",
      latitude: rec.lat === "" ? null : Number(rec.lat),
      longitude: rec.lng === "" ? null : Number(rec.lng),
      bedrooms: Number(rec.bedrooms || 0),
      bathrooms: Number(rec.bathrooms || 0),
      floor_area_sqm: rec.floorArea ? Number(rec.floorArea) : null,
      lot_size_sqm: rec.lotArea ? Number(rec.lotArea) : null,
      year_built: rec.yearBuilt ? Number(rec.yearBuilt) : null,
      featured: Boolean(rec.featured),
      is_published: Boolean(rec.isPublished),
      images: Array.isArray(rec.photos) ? rec.photos : [],
      details: {
        parking: Number(rec.parking || 0),
        floors: Number(rec.floors || 0),
        financing: Array.isArray(rec.financing) ? rec.financing : [],
        title_type: rec.titleType || "",
        title_no: rec.titleNo || "",
        tax_dec_no: rec.taxDecNo || "",
        zoning: rec.zoning || "",
        turnover_date: rec.turnoverDate || "",
        developer: rec.developer || "",
        license_to_sell: rec.licenseToSell || "",
        hoa_dues: Number(rec.hoaDues || 0),
        condo_dues: Number(rec.condoDues || 0),
        video_url: rec.videoUrl || ""
      }
    };
  }
  async function loadAllListingPages(method, params) {
    let page = 1, pages = 1, data = [];
    do {
      const result = await method(Object.assign({}, params, { page: page, per_page: 50 }));
      data = data.concat(result.data || []);
      pages = Math.min(Number(result.total_pages || 1), 100);
      page += 1;
    } while (page <= pages);
    return data;
  }
  async function loadCloudListings() {
    if (!LISTINGS_API || !currentUser || !currentUser.id) return;
    try {
      const tasks = [loadAllListingPages(LISTINGS_API.list, { sort: "date_desc" }), LISTINGS_API.favorites()];
      if (listingCanManage()) tasks.push(loadAllListingPages(LISTINGS_API.mine, {}));
      const results = await Promise.all(tasks);
      cloudListingsReady = "ok";
      const publicListings = (results[0] || []).map(listingFromApi);
      cloudSavedListings = (results[1].data || []).map(listingFromApi);
      cloudMyListings = results[2] ? (results[2] || []).map(listingFromApi) : [];
      const merged = new Map();
      publicListings.concat(cloudMyListings).forEach(item => {
        const previous = merged.get(item.id);
        merged.set(item.id, previous ? Object.assign({}, previous, item, {
          agentName: item.agentName || previous.agentName || "",
          createdByName: item.createdByName || previous.createdByName || ""
        }) : item);
      });
      state.listings = Array.from(merged.values());
      state.favorites = cloudSavedListings.map(item => item.id);
      state.listingStats = state.listingStats || {};
      state.listings.forEach(item => { state.listingStats[item.id] = { views: item.views || 0, inquiries: item.inquiries || 0 }; });
      syncTransactionsToListings();
    } catch (e) {
      cloudListingsReady = "error";
      toast("Could not load listings: " + esc(friendlyErr(e.message)), "err");
    }
  }
  window.__geoGo = function () { var b = document.querySelector("[data-inv-geocode]"); if (b) geocodeInventoryMissing(b); };
  async function geocodeInventoryMissing(btn) {
    if (window.__geoBusy) return;
    window.__geoBusy = true;
    try {
    if (btn) btn.disabled = true;
    const targets = (state.listings || []).filter(l => !(Number(l.lat) && Number(l.lng))).slice(0, 8);
    if (!targets.length) { toast("All listings already have coordinates", "info"); if (btn) btn.disabled = false; return; }
    let ok = 0;
    const changed = [];
    for (const rec of targets) {
      const q = [rec.title, rec.barangay, rec.city, rec.province, "Philippines"].filter(Boolean).join(", ");
      try {
        const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=" + encodeURIComponent(q), { headers: { Accept: "application/json" } });
        const j = await r.json();
        if (Array.isArray(j) && j[0]) { rec.lat = Number(j[0].lat); rec.lng = Number(j[0].lon); changed.push(rec); ok++; }
      } catch (e) {}
      await new Promise(res => setTimeout(res, 1100));
    }
    save(); render();
    toast("Located " + ok + " of " + targets.length + " listings via OpenStreetMap");
    if (psCloud()) { for (const rec of changed) { try { await persistListingToCloud(rec); } catch (cloudErr) {} } }
    if (btn) btn.disabled = false;
    } finally { window.__geoBusy = false; }
  }
  async function persistListingToCloud(rec) {
    if (!LISTINGS_API || !currentUser || !currentUser.id || !rec) throw new Error("Listings API is unavailable");
    const result = rec._isNew ? await LISTINGS_API.create(listingToApi(rec)) : await LISTINGS_API.update(rec.id, listingToApi(rec));
    return result && result.data;
  }
  async function deleteListingFromCloud(id) {
    if (!LISTINGS_API || !currentUser || !currentUser.id) throw new Error("Listings API is unavailable");
    return LISTINGS_API.remove(id);
  }
  async function bumpSharedListingStat(id, key) {
    return;
  }
  let cloudLeadsReady = null;
  async function loadCloudLeads() {
    if (!SB || !currentUser || !currentUser.id) return;
    try {
      const { data, error } = await SB.from("crm_leads").select("payload,assigned_to_id,created_by").order("updated_at", { ascending: false });
      if (error) {
        if (String(error.message || "").match(/does not exist|schema cache|querying schema|relation "public.crm_leads"/i)) {
          cloudLeadsReady = "missing";
        } else {
          throw error;
        }
        return;
      }
      cloudLeadsReady = "ok";
      state.leads = Array.isArray(data) ? data.map(r => Object.assign({}, r.payload, {
        assignedToId: r.assigned_to_id || (r.payload && r.payload.assignedToId) || "",
        createdBy: r.created_by || (r.payload && r.payload.createdBy) || ""
      })) : [];
    } catch (e) {
      cloudLeadsReady = "error";
    }
  }
  async function persistLeadToCloud(rec) {
    if (!SB || !currentUser || !currentUser.id) return;
    try {
      const row = {
        id: rec.id,
        ref: rec.ref || "",
        name: rec.name || "",
        assigned_to: (rec.assignedTo || "").trim(),
        assigned_to_id: rec.assignedToId || null,
        payload: rec,
        created_by: rec.createdBy || currentUser.id,
        updated_at: rec.updatedAt || new Date().toISOString()
      };
      const { error } = await SB.from("crm_leads").upsert(row, { onConflict: "id" });
      if (error) {
        if (String(error.message || "").match(/does not exist|schema cache|querying schema|relation "public.crm_leads"/i)) {
          toast("Leads sync needs the crm_leads table — run supabase/crm_leads.sql in the SQL Editor.", "err");
        } else {
          toast("Could not sync lead: " + esc(friendlyErr(error.message)), "err");
        }
      }
    } catch (e) {}
  }
  async function deleteLeadFromCloud(id) {
    if (!SB || !currentUser || !currentUser.id) return;
    try {
      const { error } = await SB.from("crm_leads").delete().eq("id", id);
      if (error && !String(error.message || "").match(/does not exist|schema cache|querying schema|relation "public.crm_leads"/i)) {
        toast("Could not delete lead: " + esc(friendlyErr(error.message)), "err");
      }
    } catch (e) {}
  }
  let cloudTransactionsReady = null;
  async function loadCloudTransactions() {
    if (!SB || !currentUser || !currentUser.id) return;
    try {
      const { data, error } = await SB.from("broker_transactions").select("payload,broker_id,created_by").order("updated_at", { ascending: false });
      if (error) {
        if (String(error.message || "").match(/does not exist|schema cache|querying schema|relation "public.broker_transactions"/i)) cloudTransactionsReady = "missing";
        else throw error;
        return;
      }
      cloudTransactionsReady = "ok";
      state.transactions = Array.isArray(data) ? data.map(r => Object.assign({}, r.payload, {
        brokerId: r.broker_id || (r.payload && r.payload.brokerId) || "",
        createdBy: r.created_by || (r.payload && r.payload.createdBy) || ""
      })) : [];
      syncTransactionsToListings();
    } catch (e) {
      cloudTransactionsReady = "error";
    }
  }
  async function persistTransactionToCloud(rec) {
    if (!SB || !currentUser || !currentUser.id || !rec) return;
    try {
      if (!rec.createdBy) rec.createdBy = currentUser.id;
      if (!rec.brokerId) rec.brokerId = currentUser.id;
      const docs = vaultDocs("tx", rec.id);
      if (docs.length) rec.documents = docs;
      const { error } = await SB.from("broker_transactions").upsert({
        id: rec.id,
        ref: rec.ref || "",
        title: rec.title || "",
        payload: rec,
        broker_id: rec.brokerId,
        created_by: rec.createdBy,
        updated_at: rec.updatedAt || new Date().toISOString()
      }, { onConflict: "id" });
      if (error) {
        if (String(error.message || "").match(/does not exist|schema cache|querying schema|relation "public.broker_transactions"/i)) toast("Transaction sharing needs the broker_transactions table — run supabase/broker_transactions.sql in the SQL Editor.", "err");
        else toast("Could not sync transaction: " + esc(friendlyErr(error.message)), "err");
      }
    } catch (e) {}
  }
  async function deleteTransactionFromCloud(id) {
    if (!SB || !currentUser || !currentUser.id) return;
    try {
      const { error } = await SB.from("broker_transactions").delete().eq("id", id);
      if (error && !String(error.message || "").match(/does not exist|schema cache|querying schema|relation "public.broker_transactions"/i)) toast("Could not delete transaction: " + esc(friendlyErr(error.message)), "err");
    } catch (e) {}
  }
  function syncLead(l) { if (l) persistLeadToCloud(l); }
  function leadScope() {
    if (userRole() === "agent") {
      const me = currentUser ? (currentUser.name || "").trim() : "";
      const myId = currentUser && currentUser.id;
      return (state.leads || []).filter(l => (myId && (l.assignedToId === myId || l.createdBy === myId)) || (!l.assignedToId && (l.assignedTo || "").trim() === me));
    }
    if (userRole() === "broker") {
      const members = brokerTeamMembers();
      const teamIds = members.map(m => m.id).filter(Boolean);
      const teamNames = members.map(m => m.name);
      const myId = currentUser && currentUser.id;
      return (state.leads || []).filter(l => {
        if (myId && (l.createdBy === myId || l.assignedToId === myId)) return true;
        if (l.assignedToId) return teamIds.indexOf(l.assignedToId) >= 0 || teamIds.indexOf(l.createdBy) >= 0;
        const assigned = (l.assignedTo || "").trim();
        return assigned && teamNames.indexOf(assigned) >= 0;
      });
    }
    return state.leads || [];
  }
  function leadFiltered() {
    const f = state.leadFilters || {};
    let arr = leadScope().slice();
    const q = String(f.q || "").trim().toLowerCase();
    if (q) arr = arr.filter(l => [l.name, l.email, l.phone, l.ref, l.notes, l.listingTitle].join(" ").toLowerCase().indexOf(q) >= 0);
    if (f.type) arr = arr.filter(l => l.type === f.type);
    if (f.status) arr = arr.filter(l => l.status === f.status);
    if (f.source) arr = arr.filter(l => l.source === f.source);
    if (f.agent) arr = arr.filter(l => l.assignedTo === f.agent);
    if (f.minBudget && C.num(f.minBudget, 0) > 0) arr = arr.filter(l => {
      const b = l.type === "seller" ? l.askingPrice : (l.type === "renter" ? l.rentBudget : l.budget);
      return C.num(b, 0) >= C.num(f.minBudget, 0);
    });
    arr.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return arr;
  }
  function leadCard(l) {
    const can = leadCanEdit(l);
    return '<div class="lead-card" data-lead-open="' + esc(l.id) + '">' +
      '<div class="lead-card-top">' + leadAvatar(l.name) +
        '<div class="grow"><div class="lead-card-name">' + esc(l.name || "Unnamed") + "</div>" +
        '<div class="lead-card-sub dim tiny">' + esc(l.ref || "") + " · " + esc(leadTypeLabel(l.type)) + "</div></div>" +
        (can ? '<button class="icon-btn btn-sm" data-lead-edit="' + esc(l.id) + '" title="Edit">' + icon("edit", 13) + "</button>" : "") +
      "</div>" +
      '<div class="lead-card-meta">' +
        (l.budget || l.askingPrice || l.rentBudget ? '<div class="lead-card-budget">' + leadBudget(l) + "</div>" : "") +
        '<div class="dim tiny">' + icon("pin", 11) + " " + esc(l.source ? leadSourceLabel(l.source) : "—") + "</div>" +
      "</div>" +
      (l.listingTitle ? '<div class="lead-card-listing dim tiny">' + icon("home", 11) + " " + esc(l.listingTitle) + "</div>" : "") +
      '<div class="lead-card-foot"><span class="dim tiny">' + icon("calendar", 11) + " " + esc(leadDaysSince(l)) + "</span>" +
      (l.assignedTo ? '<span class="dim tiny">' + icon("users", 11) + " " + esc(l.assignedTo) + "</span>" : "") + "</div>" +
    "</div>";
  }
  function leadBoardHTML() {
    const all = leadFiltered();
    const cols = LEAD_STATUSES.map(s => {
      const items = all.filter(l => l.status === s[0]);
      return '<div class="lead-col"><div class="lead-col-head"><span class="badge ' + s[2] + '">' + esc(s[1]) + "</span><span class='dim tiny'>" + items.length + "</span></div><div class='lead-col-body'>" +
        (items.length ? items.map(leadCard).join("") : '<div class="lead-col-empty dim tiny">No leads</div>') +
        "</div></div>";
    }).join("");
    return '<div class="lead-board">' + cols + "</div>";
  }
  function calendarDateKey(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function calendarMonthDate() {
    const raw = /^\d{4}-\d{2}$/.test(state.leadCalendarMonth || "") ? state.leadCalendarMonth : calendarDateKey(new Date()).slice(0, 7);
    const parts = raw.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, 1);
  }
  function calendarType(type) { return CAL_EVENT_TYPES.find(x => x[0] === type) || CAL_EVENT_TYPES[1]; }
  function leadCalendarEvents() {
    const leads = leadScope();
    const leadIds = leads.map(l => l.id);
    const out = [];
    const sharedVisitIds = [];
    leads.forEach(l => (l.calendarEvents || []).forEach(ev => {
      if (ev.sourceVisitId) sharedVisitIds.push(ev.sourceVisitId);
      out.push(Object.assign({}, ev, { leadId: l.id, leadName: l.name || "Lead", assignedTo: l.assignedTo || "" }));
    }));
    (state.siteVisits || []).forEach(v => {
      if (leadIds.indexOf(v.leadId) < 0 || sharedVisitIds.indexOf(v.id) >= 0) return;
      const l = leads.find(x => x.id === v.leadId);
      out.push({ id: "legacy-" + v.id, sourceVisitId: v.id, legacy: true, leadId: v.leadId, leadName: l ? l.name : "Lead", assignedTo: l ? l.assignedTo || "" : "", type: "showing", title: "Site viewing", date: v.date, time: v.time, location: v.location, notes: v.notes, reminder: v.remind, status: v.status || "scheduled" });
    });
    return out.filter(ev => /^\d{4}-\d{2}-\d{2}$/.test(ev.date || "")).sort((a, b) => (a.date + " " + (a.time || "")).localeCompare(b.date + " " + (b.time || "")));
  }
  function leadCalendarHTML() {
    const month = calendarMonthDate();
    const monthKey = calendarDateKey(month).slice(0, 7);
    state.leadCalendarMonth = monthKey;
    const today = calendarDateKey(new Date());
    const events = leadCalendarEvents();
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - first.getDay());
    const days = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const key = calendarDateKey(date);
      const dayEvents = events.filter(ev => ev.date === key);
      const chips = dayEvents.slice(0, 3).map(ev => {
        const cfg = calendarType(ev.type);
        return '<button class="cal-event cal-' + cfg[2] + (ev.status && ev.status !== "scheduled" ? " is-" + esc(ev.status) : "") + '" data-cal-event="' + esc(ev.id) + '" data-cal-lead="' + esc(ev.leadId) + '" title="' + esc((ev.title || cfg[1]) + " — " + ev.leadName) + '"><span>' + esc(ev.time || "All day") + '</span> ' + esc(ev.title || cfg[1]) + '</button>';
      }).join("");
      days.push('<div class="cal-day' + (key.slice(0, 7) !== monthKey ? " outside" : "") + (key === today ? " today" : "") + '" data-cal-day="' + key + '"><div class="cal-day-num">' + date.getDate() + '</div><div class="cal-events">' + chips + (dayEvents.length > 3 ? '<div class="cal-more">+' + (dayEvents.length - 3) + ' more</div>' : "") + '</div></div>');
    }
    const upcoming = events.filter(ev => ev.date >= today && ev.status !== "cancelled").slice(0, 7);
    const upcomingRows = upcoming.map(ev => {
      const cfg = calendarType(ev.type);
      return '<button class="cal-upcoming" data-cal-event="' + esc(ev.id) + '" data-cal-lead="' + esc(ev.leadId) + '"><span class="cal-upcoming-date"><b>' + esc(new Date(ev.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })) + '</b><small>' + esc(ev.time || "All day") + '</small></span><span class="cal-dot cal-' + cfg[2] + '"></span><span class="grow"><b>' + esc(ev.title || cfg[1]) + '</b><small>' + esc(ev.leadName + (ev.location ? " · " + ev.location : "")) + '</small></span></button>';
    }).join("");
    const legend = CAL_EVENT_TYPES.map(t => '<span><i class="cal-dot cal-' + t[2] + '"></i>' + esc(t[1]) + '</span>').join("");
    return '<div class="crm-calendar-layout"><div class="card crm-calendar"><div class="cal-head"><div><div class="eyebrow">Real estate calendar</div><h2>' + esc(month.toLocaleDateString(undefined, { month: "long", year: "numeric" })) + '</h2></div><div class="cal-nav"><button class="btn btn-ghost btn-sm" data-cal-nav="-1" title="Previous month">&lsaquo;</button><button class="btn btn-ghost btn-sm" data-cal-nav="0">Today</button><button class="btn btn-ghost btn-sm" data-cal-nav="1" title="Next month">&rsaquo;</button></div></div>' +
      '<div class="cal-week"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="cal-grid">' + days.join("") + '</div><div class="cal-legend">' + legend + '</div></div>' +
      '<aside class="card card-pad cal-agenda"><div class="row spread"><div><div class="eyebrow">Next up</div><h3>Upcoming</h3></div><button class="icon-btn" data-cal-new title="Add event">' + icon("plus", 15) + '</button></div><div class="cal-upcoming-list">' + (upcomingRows || '<div class="empty"><div class="dim tiny">No upcoming events.</div></div>') + '</div></aside></div>';
  }
  function openCalendarEventEditor(date, leadId, eventId) {
    if (!leadCanManage()) { toast("You don't have permission to manage calendar events", "err"); return; }
    closeCalendarEventModal();
    const leads = leadScope();
    if (!leads.length) { toast("Add a lead before scheduling an event", "err"); return; }
    let lead = leads.find(l => l.id === leadId) || leads[0];
    let event = eventId && lead ? (lead.calendarEvents || []).find(ev => ev.id === eventId) : null;
    if (!event && eventId) {
      lead = leads.find(l => (l.calendarEvents || []).some(ev => ev.id === eventId)) || lead;
      event = lead ? (lead.calendarEvents || []).find(ev => ev.id === eventId) : null;
    }
    if (eventId && !event) { toast("This legacy viewing can be managed from the lead detail", "err"); return; }
    const value = event || {};
    const selectedLeadId = lead ? lead.id : "";
    const leadOpts = leads.map(l => '<option value="' + esc(l.id) + '"' + (l.id === selectedLeadId ? " selected" : "") + '>' + esc(l.name + (l.assignedTo ? " — " + l.assignedTo : "")) + '</option>').join("");
    const typeOpts = CAL_EVENT_TYPES.map(t => '<option value="' + t[0] + '"' + ((value.type || "showing") === t[0] ? " selected" : "") + '>' + esc(t[1]) + '</option>').join("");
    const statusOpts = [["scheduled", "Scheduled"], ["completed", "Completed"], ["cancelled", "Cancelled"]].map(s => '<option value="' + s[0] + '"' + ((value.status || "scheduled") === s[0] ? " selected" : "") + '>' + s[1] + '</option>').join("");
    const listingOpts = (state.listings || []).map(l => '<option value="' + esc(l.title || "Untitled listing") + '" label="' + esc([l.ref, l.city, l.province].filter(Boolean).join(" · ")) + '"></option>').join("");
    const titleField = leadFld("Title *", '<input class="input" id="ce-title" list="ce-listing-dl" type="text" value="' + esc(value.title || "") + '" placeholder="Search a listing property or type a custom title…"><datalist id="ce-listing-dl">' + listingOpts + '</datalist>');
    const body = '<div class="grid grid-2">' +
      leadFld("Lead *", '<select class="input" id="ce-lead"' + (event ? " disabled" : "") + '>' + leadOpts + '</select>') +
      leadFld("Event type", '<select class="input" id="ce-type">' + typeOpts + '</select>') +
      leadFld("Date *", '<input class="input" id="ce-date" type="date" value="' + esc(value.date || date || calendarDateKey(new Date())) + '">') +
      leadFld("Time", '<input class="input" id="ce-time" type="time" value="' + esc(value.time || "10:00") + '">') +
      titleField +
      leadFld("Status", '<select class="input" id="ce-status">' + statusOpts + '</select>') +
      leadFld("Location / property", leadTxt("ce-location", value.location || "", "e.g. One Orchard showroom")) +
      leadFld("Reminder", '<select class="input" id="ce-reminder"><option value="1"' + (value.reminder === "1" ? " selected" : "") + '>1 hour before</option><option value="3"' + (!value.reminder || value.reminder === "3" ? " selected" : "") + '>3 hours before</option><option value="24"' + (value.reminder === "24" ? " selected" : "") + '>1 day before</option><option value="0"' + (value.reminder === "0" ? " selected" : "") + '>No reminder</option></select>') +
      '</div><div class="field mt-8"><label>Notes</label><textarea class="input" id="ce-notes" rows="3" placeholder="Client requirements, documents to bring, access instructions...">' + esc(value.notes || "") + '</textarea></div>';
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "ce-modal";
    ov.setAttribute("data-event-id", event ? event.id : "");
    ov.setAttribute("data-lead-id", selectedLeadId);
    ov.innerHTML = '<div class="modal-card modal-card-wide"><div class="modal-head"><h3>' + icon("calendar", 15) + (event ? ' Edit Calendar Event' : ' Add Calendar Event') + '</h3><button class="icon-btn" data-cal-cancel title="Close">&times;</button></div><div class="modal-body">' + body + '</div><div class="modal-foot">' +
      (event ? '<button class="btn btn-ghost danger" data-cal-delete>Delete Event</button>' : "") + '<span class="grow"></span><button class="btn btn-ghost" data-cal-cancel>Cancel</button><button class="btn btn-primary" data-cal-save>' + icon("check", 15) + ' Save Event</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeCalendarEventModal(); });
    const titleInput = $("#ce-title");
    if (titleInput) titleInput.addEventListener("change", function () {
      const t = titleInput.value.trim();
      const match = (state.listings || []).find(function (l) { return (l.title || "Untitled listing").trim() === t; });
      if (match) {
        const loc = $("#ce-location");
        if (loc) loc.value = [match.address, match.city, match.province].filter(Boolean).join(", ") || match.title;
      }
    });
  }
  function closeCalendarEventModal() { const m = $("#ce-modal"); if (m) m.remove(); }
  function calendarSaveEvent() {
    const modal = $("#ce-modal");
    if (!modal) return;
    const leadId = modal.getAttribute("data-event-id") ? modal.getAttribute("data-lead-id") : (($("#ce-lead") || {}).value || "");
    const lead = leadScope().find(l => l.id === leadId);
    const date = (($("#ce-date") || {}).value || "").trim();
    const title = (($("#ce-title") || {}).value || "").trim();
    if (!lead || !date || !title) { toast("Lead, date, and title are required", "err"); return; }
    lead.calendarEvents = lead.calendarEvents || [];
    const eventId = modal.getAttribute("data-event-id");
    let ev = eventId ? lead.calendarEvents.find(x => x.id === eventId) : null;
    const created = !ev;
    if (!ev) { ev = { id: "event-" + Date.now() + "-" + Math.floor(Math.random() * 1000), createdAt: new Date().toISOString() }; lead.calendarEvents.push(ev); }
    ev.type = (($("#ce-type") || {}).value || "follow-up");
    ev.title = title;
    ev.date = date;
    ev.time = (($("#ce-time") || {}).value || "").trim();
    ev.location = (($("#ce-location") || {}).value || "").trim();
    ev.reminder = (($("#ce-reminder") || {}).value || "3");
    ev.status = (($("#ce-status") || {}).value || "scheduled");
    ev.notes = (($("#ce-notes") || {}).value || "").trim();
    ev.updatedAt = new Date().toISOString();
    lead.updatedAt = ev.updatedAt;
    if (created) { lead.activity = lead.activity || []; lead.activity.push({ date: ev.createdAt, text: "Calendar event scheduled: " + ev.title + " — " + ev.date + (ev.time ? " " + ev.time : "") }); }
    closeCalendarEventModal();
    save(); render(); syncLead(lead);
    toast(created ? "Calendar event scheduled" : "Calendar event updated");
  }
  function calendarDeleteEvent() {
    const modal = $("#ce-modal");
    if (!modal) return;
    const lead = leadScope().find(l => l.id === modal.getAttribute("data-lead-id"));
    const eventId = modal.getAttribute("data-event-id");
    if (!lead || !eventId || !confirm("Delete this calendar event?")) return;
    lead.calendarEvents = (lead.calendarEvents || []).filter(ev => ev.id !== eventId);
    lead.updatedAt = new Date().toISOString();
    closeCalendarEventModal();
    save(); render(); syncLead(lead); toast("Calendar event deleted", "err");
  }
  function calendarNavigate(delta) {
    const d = delta === 0 ? new Date() : calendarMonthDate();
    if (delta) d.setMonth(d.getMonth() + delta);
    state.leadCalendarMonth = calendarDateKey(d).slice(0, 7);
    save(); render();
  }
  function leadTeamPanel() {
    if (userRole() !== "broker") return "";
    const members = brokerTeamMembers();
    let body = "";
    if (brokerTeamStatus === "loading") body = '<div class="dim">Loading linked agents...</div>';
    else if (brokerTeamStatus === "error") body = '<div class="notice-banner err">' + icon("alert", 14) + '<span>Could not load linked agents. Run <b>supabase/crm_leads.sql</b> in the Supabase SQL Editor.</span></div>';
    else if (!members.length) body = '<div class="empty"><div class="dim">No agents are linked to this broker account.</div></div>';
    const leads = state.leads || [];
    const rows = members.map(m => {
      const mine = leads.filter(l => (l.assignedTo || "").trim() === m.name);
      const active = mine.filter(l => ["new", "contacted", "site-visit", "offer", "negotiation"].indexOf(l.status) >= 0).length;
      const closed = mine.filter(l => l.status === "closed").length;
      return '<div class="team-agent">' +
        '<div class="lead-avatar">' + esc((m.name || "?").charAt(0).toUpperCase()) + "</div>" +
        '<div class="grow"><div class="team-agent-name">' + esc(m.name) + '</div><div class="dim tiny">' + (m.email ? esc(m.email) : "Linked agent") + "</div></div>" +
        '<div class="team-agent-stats"><span class="badge">' + mine.length + ' leads</span>' +
        '<span class="badge gold">' + active + ' active</span>' +
        '<span class="badge green">' + closed + ' closed</span></div>' +
        "</div>";
    }).join("");
    if (members.length) body = '<div class="team-agent-list">' + rows + "</div>";
    return '<div class="card card-pad mb-24" id="team-panel"><h3 class="mb-16">' + icon("users", 15) + " Linked agents <span class='dim tiny'>(" + members.length + ")</span></h3>" +
      '<p class="dim tiny mb-16">Agents linked to your account — every lead they enter in CRM appears in your pipeline below.</p>' +
      body + "</div>";
  }
  function leadBrokerPanel() {
    if (userRole() !== "agent") return "";
    const broker = agentLinkedBroker();
    let body = "";
    if (!(currentUser && currentUser.demo) && linkedBrokerStatus === "loading") body = '<div class="dim">Loading linked broker...</div>';
    else if (!(currentUser && currentUser.demo) && linkedBrokerStatus === "error") body = '<div class="notice-banner err">' + icon("shield", 14) + '<span>Could not load your linked broker. Ask the Super Admin to verify the account link.</span></div>';
    else if (!broker) body = '<div class="empty"><div class="dim">No supervising broker is linked to this agent account.</div></div>';
    else body = '<div class="team-agent"><div class="lead-avatar">' + esc(leadInitials(broker.name)) + '</div>' +
      '<div class="grow"><div class="team-agent-name">' + esc(broker.name || "Linked broker") + '</div><div class="dim tiny">' + esc(broker.email || broker.agency || "Licensed Broker") + '</div></div>' +
      '<div class="team-agent-stats"><span class="badge blue">Licensed Broker</span>' + (broker.prc ? '<span class="badge">PRC ' + esc(broker.prc) + '</span>' : "") + '</div></div>';
    return '<div class="card card-pad mb-24" id="broker-panel"><h3 class="mb-16">' + icon("shield", 15) + ' Linked broker</h3>' +
      '<p class="dim tiny mb-16">Your supervising licensed broker for CRM leads and transactions.</p>' + body + '</div>';
  }
  function renderLeads() {
    if (state.leadDetail) {
      const l = (state.leads || []).find(x => x.id === state.leadDetail);
      if (l && leadScope().indexOf(l) >= 0) return renderLeadDetail(l);
      state.leadDetail = null;
    }
    const f = state.leadFilters = state.leadFilters || {};
    const can = leadCanManage();
    const opt = (opts, val, allLabel) => '<option value="">' + esc(allLabel || "All") + "</option>" + opts.map(o => '<option value="' + o[0] + '"' + (val === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("");
    const leads = leadScope();
    const brokerAssignments = roleIs("broker") ? [((currentUser && currentUser.name) || "").trim()].concat(brokerTeamNames() || []) : [];
    const agents = roleIs("agent") ? [] : Array.from(new Set((roleIs("broker") ? brokerAssignments : leads.map(l => l.assignedTo)).filter(Boolean))).sort();
    const agentOpts = roleIs("agent") ? "" : '<option value="">All agents</option>' + agents.map(a => '<option value="' + esc(a) + '"' + (f.agent === a ? " selected" : "") + ">" + esc(a) + "</option>").join("");
    const newCount = leads.filter(l => l.status === "new").length;
    const activeCount = leads.filter(l => ["contacted", "site-visit", "offer", "negotiation"].indexOf(l.status) >= 0).length;
    const wonCount = leads.filter(l => l.status === "closed").length;
    const lostCount = leads.filter(l => l.status === "lost").length;
    const conv = (wonCount + lostCount) > 0 ? Math.round(wonCount / (wonCount + lostCount) * 100) + "%" : "—";
    const mode = state.leadMode === "calendar" ? "calendar" : "pipeline";
    let html = '<div class="hero"><div><h1>CRM / Leads</h1><p>Track buyer and seller inquiries from first contact to closed deal.</p></div><div class="actions">' +
      '<div class="crm-switch"><button data-lead-mode="pipeline" class="' + (mode === "pipeline" ? "on" : "") + '">' + icon("layers", 14) + ' Pipeline</button><button data-lead-mode="calendar" class="' + (mode === "calendar" ? "on" : "") + '">' + icon("calendar", 14) + ' Calendar</button></div>' +
      (can && mode === "calendar" ? '<button class="btn btn-primary" data-cal-new>' + icon("plus", 15) + " Add Event</button>" : "") +
      (can ? '<button class="btn btn-primary" data-lead-new>' + icon("plus", 15) + " Add Lead</button>" : "") + "</div></div>";
    html += '<div class="lead-stats">' +
      '<div class="ls-stat"><div class="ls-stat-v">' + leads.length + '</div><div class="ls-stat-l dim">Total leads</div></div>' +
      '<div class="ls-stat"><div class="ls-stat-v">' + newCount + '</div><div class="ls-stat-l dim">New</div></div>' +
      '<div class="ls-stat"><div class="ls-stat-v">' + activeCount + '</div><div class="ls-stat-l dim">In pipeline</div></div>' +
      '<div class="ls-stat"><div class="ls-stat-v">' + wonCount + '</div><div class="ls-stat-l dim">Closed / won</div></div>' +
      '<div class="ls-stat"><div class="ls-stat-v">' + lostCount + '</div><div class="ls-stat-l dim">Lost</div></div>' +
      '<div class="ls-stat"><div class="ls-stat-v">' + conv + '</div><div class="ls-stat-l dim">Conversion</div></div>' +
      "</div>";
    html += leadBrokerPanel();
    html += leadTeamPanel();
    if (mode === "calendar") html += '<div id="lead-results">' + leadCalendarHTML() + "</div>";
    else {
      html += '<div class="card card-pad mb-24" id="lf-filters"><div class="grid grid-4">' +
        '<div class="field"><label>Search</label><input class="input" id="lf-q" type="text" value="' + esc(f.q || "") + '" placeholder="Name, email, phone, ref…"></div>' +
        '<div class="field"><label>Lead type</label><select class="input" id="lf-type">' + opt(LEAD_TYPES, f.type) + "</select></div>" +
        '<div class="field"><label>Status</label><select class="input" id="lf-status">' + opt(LEAD_STATUSES, f.status) + "</select></div>" +
        '<div class="field"><label>Source</label><select class="input" id="lf-source">' + opt(LEAD_SOURCES, f.source) + "</select></div>" +
        '<div class="field"><label>Assigned agent</label><select class="input" id="lf-agent">' + agentOpts + "</select></div>" +
        '<div class="field"><label>Min budget (₱)</label><input class="input input-num" id="lf-minb" type="text" inputmode="decimal" value="' + (C.num(f.minBudget, 0) > 0 ? C.fmtNum(f.minBudget) : "") + '" placeholder="0"></div>' +
        "</div></div>";
      html += '<div id="lead-results">' + leadBoardHTML() + "</div>";
    }
    return html;
  }
  function leadDetailRow(k, v) { return "<tr><td>" + esc(k) + "</td><td>" + (v ? esc(String(v)) : "—") + "</td></tr>"; }
  function leadActLine(a) { return '<div class="lead-act"><div class="lead-act-dot"></div><div class="grow"><div class="lead-act-text">' + esc(a.text || "") + '</div><div class="lead-act-date dim tiny">' + esc(new Date(a.date).toLocaleString()) + "</div></div></div>"; }
  function renderLeadDetail(l) {
    const can = leadCanEdit(l);
    const acts = (l.activity || []).slice().reverse();
    const listing = (state.listings || []).find(x => x.id === l.listingId);
    const visits = visitsFor(l.id);
    let html = '<div class="hero"><div><button class="btn btn-ghost btn-sm" data-lead-back>' + icon("back", 13) + " Back to leads</button>" +
      '<div class="row mt-8" style="gap:12px"><span class="lead-avatar lead-avatar-lg">' + esc(leadInitials(l.name)) + "</span>" +
      '<div><h1 class="mt-0" style="margin:0">' + esc(l.name || "Lead") + "</h1>" +
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:4px">' + leadStatusBadge(l.status) + '<span class="badge blue">' + esc(leadTypeLabel(l.type)) + "</span></div></div></div></div>" +
       '<div class="actions">' +
       (can ? '<button class="btn btn-ghost btn-sm" data-lead-edit="' + esc(l.id) + '">' + icon("edit", 14) + " Edit</button>" : "") +
       (can ? '<button class="btn btn-ghost btn-sm" data-lead-visit="' + esc(l.id) + '">' + icon("calendar", 14) + " Schedule Viewing</button>" : "") +
       (can && l.status !== "closed" && l.status !== "lost" ? '<button class="btn btn-ghost btn-sm" data-lead-advance="' + esc(l.id) + '">' + icon("arrow", 14) + " Advance</button>" : "") +
      (can ? '<button class="btn btn-ghost btn-sm" data-lead-del="' + esc(l.id) + '">' + icon("trash", 14) + " Delete</button>" : "") +
      "</div></div>";
    html += '<div class="grid grid-3 mb-24">';
    html += '<div style="grid-column:span 2" class="card card-pad">' +
      '<h3>Lead Information</h3><div class="table-wrap mt-8"><table class="data"><tbody>' +
      leadDetailRow("Reference", l.ref) +
      leadDetailRow("Lead Type", leadTypeLabel(l.type)) +
      leadDetailRow("Status", leadStatusCfg(l.status) ? leadStatusCfg(l.status)[1] : "—") +
      leadDetailRow("Email", l.email) +
      leadDetailRow("Phone", l.phone) +
      leadDetailRow("Source", leadSourceLabel(l.source)) +
      leadDetailRow("Assigned Agent", l.assignedTo) +
      (l.type === "seller" ? leadDetailRow("Asking Price", l.askingPrice ? C.money(l.askingPrice) : "—") : (l.type === "renter" ? leadDetailRow("Rent Budget", l.rentBudget ? C.money(l.rentBudget) + "/mo" : "—") : leadDetailRow("Budget", l.budget ? C.money(l.budget) : "—"))) +
      leadDetailRow("Interested In", l.propertyInterest) +
      leadDetailRow("Next Follow-up", l.nextFollowUp) +
      leadDetailRow("Created", new Date(l.createdAt).toLocaleDateString()) +
      "</tbody></table></div>" +
      (l.notes ? "<h3 class='mt-16'>Notes</h3><p class='dim mt-8'>" + esc(l.notes) + "</p>" : "") +
      "</div>";
    html += '<div class="card card-pad"><h3>Activity</h3>' +
      (can ? '<div class="row mt-8" style="gap:8px"><input class="input grow" id="lead-new-act" type="text" placeholder="Add a note / call log…"><button class="btn btn-ghost btn-sm" data-lead-act="' + esc(l.id) + '">' + icon("plus", 13) + " Add</button></div>" : "") +
      '<div class="lead-acts mt-16">' + (acts.length ? acts.map(leadActLine).join("") : '<div class="dim tiny">No activity yet.</div>') + "</div></div>";
    html += "</div>";
    if (listing) {
      html += '<div class="card card-pad mb-24"><div class="row spread"><div><h3>Interested Listing</h3><div class="dim mt-8">' + esc(listing.title) + "</div></div>" +
        '<button class="btn btn-ghost btn-sm" data-lead-goto-listing="' + esc(listing.id) + '">' + icon("home", 14) + " View listing</button></div></div>";
    }
    html += '<div class="card card-pad mb-24"><div class="row spread"><div><h3>Site Viewings</h3><div class="dim mt-8">Calendar entries and SMS / Viber reminder prompts for this lead.</div></div>' +
      (can ? '<button class="btn btn-ghost btn-sm" data-lead-visit="' + esc(l.id) + '">' + icon("calendar", 14) + " Schedule</button>" : "") +
      "</div>" + (visits.length ? '<div class="table-wrap mt-8"><table class="data"><thead><tr><th>Date / Time</th><th>Location</th><th>Reminder</th><th>Status</th><th></th></tr></thead><tbody>' +
      visits.map(v => "<tr><td>" + esc(v.date) + " " + esc(v.time) + "</td><td>" + esc(v.location || "—") + "</td><td>" + (v.remind === "0" ? "None" : esc(v.remind || "3") + " hr before") + "</td><td>" + visitBadge(v.status) + "</td><td>" + (can && v.status === "scheduled" ? '<button class="btn btn-ghost btn-sm" data-visit-status="done" data-visit-id="' + esc(v.id) + '">Complete</button> <button class="btn btn-ghost btn-sm" data-visit-status="cancelled" data-visit-id="' + esc(v.id) + '">Cancel</button>' : "") + "</td></tr>").join("") +
      "</tbody></table></div>" : '<div class="dim mt-8">No site viewings scheduled.</div>') + "</div>";
    return html;
  }
  function leadSelOpt(opts, val) { return opts.map(o => '<option value="' + o[0] + '"' + (val === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>").join(""); }
  function leadFld(label, inner, hint) { return '<div class="field"><label>' + label + "</label>" + inner + (hint ? '<div class="field-hint">' + hint + "</div>" : "") + "</div>"; }
  function leadTxt(id, v, ph) { return '<input class="input" id="' + id + '" type="text" value="' + esc(v == null ? "" : v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + ">"; }
  function leadNum(id, v) { return '<input class="input input-num" id="' + id + '" type="text" inputmode="decimal" value="' + (C.num(v, 0) > 0 ? C.fmtNum(v) : "") + '" placeholder="0">'; }
  function openLeadEditor(id) {
    if (!leadCanManage()) { toast("You don't have permission to manage leads", "err"); return; }
    closeLeadModal();
    const l = id ? (state.leads || []).find(x => x.id === id) || {} : {};
    if (id && roleIs("agent")) {
      const mine = (l.assignedTo || "").trim() === ((currentUser && currentUser.name) || "").trim();
      if (!mine) { toast("You can only manage your own leads", "err"); return; }
    }
    if (id && !leadCanEdit(l)) { toast("You can only edit leads you created", "err"); return; }
    const listOpts = '<option value="">No linked listing</option>' + (state.listings || []).map(x => '<option value="' + esc(x.id) + '"' + (l.listingId === x.id ? " selected" : "") + ">" + esc(x.title) + "</option>").join("");
    const myName = ((currentUser && currentUser.name) || "").trim();
    const defaultAgent = roleIs("agent") ? myName : (roleIs("broker") && !id ? myName : (l.assignedTo || ""));
    let agentPool = (state.leads || []).filter(z => z.assignedTo).map(z => ({ id: z.assignedToId || "", name: z.assignedTo }));
    if (roleIs("broker")) {
      agentPool = [{ id: currentUser && currentUser.id || "", name: myName, own: true }].concat(brokerTeamMembers());
      if (l.assignedTo && !agentPool.find(a => a.name === l.assignedTo)) agentPool.push({ id: l.assignedToId || "", name: l.assignedTo });
    }
    agentPool = agentPool.filter((a, i, arr) => a.name && arr.findIndex(x => x.id && a.id ? x.id === a.id : x.name === a.name) === i).sort((a, b) => a.name.localeCompare(b.name));
    const agentOpts = roleIs("agent")
      ? '<option value="' + esc(defaultAgent) + '" data-agent-id="' + esc(currentUser && currentUser.id || "") + '" selected>' + esc(defaultAgent) + "</option>"
      : '<option value="">Unassigned</option>' + agentPool.map(a => '<option value="' + esc(a.name) + '" data-agent-id="' + esc(a.id || "") + '"' + (defaultAgent === a.name ? " selected" : "") + ">" + esc(a.name) + (a.own ? " (Myself)" : "") + "</option>").join("");
    const body =
      '<div class="grid grid-2">' +
        leadFld("Full name *", leadTxt("ld-name", l.name, "e.g. Maria Santos")) +
        leadFld("Lead type", '<select class="input" id="ld-type">' + leadSelOpt(LEAD_TYPES, l.type || "buyer") + "</select>") +
        leadFld("Email", leadTxt("ld-email", l.email, "name@email.com")) +
        leadFld("Phone", leadTxt("ld-phone", l.phone, "+63 9xx xxx xxxx")) +
        leadFld("Status", '<select class="input" id="ld-status">' + leadSelOpt(LEAD_STATUSES, l.status || "new") + "</select>") +
        leadFld("Source", '<select class="input" id="ld-source">' + leadSelOpt(LEAD_SOURCES, l.source || "listing") + "</select>") +
        leadFld("Assigned agent", '<select class="input" id="ld-agent">' + agentOpts + "</select>") +
        leadFld("Interested in", leadTxt("ld-interest", l.propertyInterest, "e.g. 3BR house & lot, Cavite")) +
        leadFld("Purchase budget (₱)", leadNum("ld-budget", l.budget)) +
        leadFld("Asking price if selling (₱)", leadNum("ld-asking", l.askingPrice)) +
        leadFld("Rent budget (₱/mo)", leadNum("ld-rent", l.rentBudget)) +
        leadFld("Next follow-up", leadTxt("ld-followup", l.nextFollowUp, "e.g. Mon 10am")) +
        leadFld("Linked listing", '<select class="input" id="ld-listing">' + listOpts + "</select>") +
      "</div>" +
      '<div class="field col-full mt-8"><label>Notes</label><textarea class="input" id="ld-notes" rows="3" placeholder="Requirements, preferences, history…">' + esc(l.notes || "") + "</textarea></div>" +
      '<div class="field col-full mt-8"><label>Add activity note (optional)</label><input class="input" id="ld-newact" type="text" placeholder="e.g. Called client — wants a site visit this weekend"></div>';
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "ld-modal";
    ov.setAttribute("data-edit-id", id || "");
    ov.innerHTML = '<div class="modal-card modal-card-wide"><div class="modal-head"><h3>' + (id ? "Edit Lead" : "Add Lead") + '</h3><button class="icon-btn" data-lead-cancel title="Close">&times;</button></div>' +
      '<div class="modal-body" style="max-height:70vh;overflow:auto">' + body + "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-lead-cancel>Cancel</button><button class="btn btn-primary" data-lead-save>' + icon("check", 15) + " Save Lead</button></div></div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeLeadModal(); });
  }
  function closeLeadModal() { const m = $("#ld-modal"); if (m) m.remove(); }
  function leadSaveForm() {
    const $v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const $n = id => { const el = document.getElementById(id); return el ? C.num(el.value, 0) : 0; };
    const name = $v("ld-name");
    if (!name) { toast("Lead name is required", "err"); return; }
    const m = $("#ld-modal");
    const editId = m ? (m.getAttribute("data-edit-id") || "") : "";
    const rec = editId ? ((state.leads || []).find(x => x.id === editId) || {}) : {};
    rec.id = rec.id || ("lead-" + Date.now() + "-" + Math.floor(Math.random() * 1000));
    rec.ref = rec.ref || "LD-" + String((state.leads || []).length + 1).padStart(4, "0");
    rec.name = name;
    rec.type = $v("ld-type") || "buyer";
    rec.email = $v("ld-email");
    rec.phone = $v("ld-phone");
    rec.status = $v("ld-status") || "new";
    rec.source = $v("ld-source") || "listing";
    const agentField = document.getElementById("ld-agent");
    const agentOption = agentField && agentField.options[agentField.selectedIndex];
    rec.assignedTo = roleIs("agent") ? ((currentUser && currentUser.name) || "").trim() : $v("ld-agent");
    rec.assignedToId = roleIs("agent") ? (currentUser && currentUser.id || "") : (agentOption && agentOption.getAttribute("data-agent-id") || "");
    rec.propertyInterest = $v("ld-interest");
    rec.budget = $n("ld-budget");
    rec.askingPrice = $n("ld-asking");
    rec.rentBudget = $n("ld-rent");
    rec.nextFollowUp = $v("ld-followup");
    rec.listingId = $v("ld-listing");
    rec.listingTitle = $v("ld-listing") ? ((state.listings || []).find(x => x.id === rec.listingId) || {}).title : "";
    rec.notes = $v("ld-notes");
    const newAct = $v("ld-newact");
    if (newAct) { rec.activity = rec.activity || []; rec.activity.push({ date: new Date().toISOString(), text: newAct }); }
    rec.updatedAt = new Date().toISOString();
    if (!rec.createdAt) { rec.createdAt = rec.updatedAt; rec.activity = rec.activity || []; rec.activity.unshift({ date: rec.createdAt, text: "Lead created" }); }
    if (!state.leads) state.leads = [];
    const idx = state.leads.findIndex(x => x.id === rec.id);
    if (idx >= 0) state.leads[idx] = rec; else state.leads.unshift(rec);
    if (!rec.createdBy) rec.createdBy = currentUser && currentUser.id;
    closeLeadModal();
    save(); render();
    persistLeadToCloud(rec);
    toast(editId ? "Lead updated" : "Lead added to pipeline");
  }
  function leadAdvance(id) {
    const l = (state.leads || []).find(x => x.id === id);
    if (!l) return;
    if (!leadCanEdit(l)) { toast("You can only edit leads you created", "err"); return; }
    const i = LEAD_PIPELINE.indexOf(l.status);
    if (i < 0) { toast("Lead is already finished", "err"); return; }
    const next = LEAD_PIPELINE[Math.min(i + 1, LEAD_PIPELINE.length - 1)];
    const prevLabel = (leadStatusCfg(l.status) || [0, l.status])[1];
    l.status = next;
    l.updatedAt = new Date().toISOString();
    l.activity = l.activity || [];
    l.activity.push({ date: l.updatedAt, text: "Status changed: " + prevLabel + " → " + (leadStatusCfg(next) || [0, next])[1] });
    save(); render();
    syncLead(l);
    toast("Lead → <b>" + esc((leadStatusCfg(next) || [0, next])[1]) + "</b>");
  }
  function leadSetStatus(id, status) {
    const l = (state.leads || []).find(x => x.id === id);
    if (!l) return;
    if (!leadCanEdit(l)) { toast("You can only edit leads you created", "err"); return; }
    const prevLabel = (leadStatusCfg(l.status) || [0, l.status])[1];
    l.status = status;
    l.updatedAt = new Date().toISOString();
    l.activity = l.activity || [];
    l.activity.push({ date: l.updatedAt, text: "Status changed: " + prevLabel + " → " + (leadStatusCfg(status) || [0, status])[1] });
    save(); render();
    syncLead(l);
    toast("Lead status updated");
  }
  function leadAddActivity(id) {
    const inp = $("#lead-new-act");
    const text = inp ? inp.value.trim() : "";
    if (!text) return;
    const l = (state.leads || []).find(x => x.id === id);
    if (!l) return;
    if (!leadCanEdit(l)) { toast("You can only edit leads you created", "err"); return; }
    l.activity = l.activity || [];
    l.activity.push({ date: new Date().toISOString(), text: text });
    l.updatedAt = new Date().toISOString();
    save(); render();
    syncLead(l);
    toast("Activity added");
  }
  function leadDelete(id) {
    const l = (state.leads || []).find(x => x.id === id);
    if (!l) return;
    if (!leadCanEdit(l)) { toast("You can only edit leads you created", "err"); return; }
    if (!confirm('Delete lead "' + (l.name || "") + '"?')) return;
    state.leads = state.leads.filter(x => x.id !== id);
    if (state.leadDetail === id) state.leadDetail = null;
    save(); render(); toast("Lead deleted", "err");
    deleteLeadFromCloud(id);
  }
  let leadHooked = false;
  function bindLeads() {
    if (!leadHooked) {
      leadHooked = true;
      document.addEventListener("click", e => {
        const mode = e.target.closest("[data-lead-mode]");
        if (mode) { state.leadMode = mode.getAttribute("data-lead-mode"); save(); render(); return; }
        const calEvent = e.target.closest("[data-cal-event]");
        if (calEvent) { e.stopPropagation(); openCalendarEventEditor("", calEvent.getAttribute("data-cal-lead"), calEvent.getAttribute("data-cal-event")); return; }
        const calNew = e.target.closest("[data-cal-new]");
        if (calNew) { openCalendarEventEditor(); return; }
        const calDay = e.target.closest("[data-cal-day]");
        if (calDay) { openCalendarEventEditor(calDay.getAttribute("data-cal-day")); return; }
        const calNav = e.target.closest("[data-cal-nav]");
        if (calNav) { calendarNavigate(Number(calNav.getAttribute("data-cal-nav"))); return; }
        const calSave = e.target.closest("[data-cal-save]");
        if (calSave) { calendarSaveEvent(); return; }
        const calDelete = e.target.closest("[data-cal-delete]");
        if (calDelete) { calendarDeleteEvent(); return; }
        const calCancel = e.target.closest("[data-cal-cancel]");
        if (calCancel) { closeCalendarEventModal(); return; }
        const ed = e.target.closest("[data-lead-edit]");
        if (ed) { e.stopPropagation(); openLeadEditor(ed.getAttribute("data-lead-edit")); return; }
        const open = e.target.closest("[data-lead-open]");
        if (open) { state.leadDetail = open.getAttribute("data-lead-open"); save(); render(); return; }
        const back = e.target.closest("[data-lead-back]");
        if (back) { state.leadDetail = null; save(); render(); return; }
        const nw = e.target.closest("[data-lead-new]");
        if (nw) { openLeadEditor(); return; }
        const adv = e.target.closest("[data-lead-advance]");
        if (adv) { leadAdvance(adv.getAttribute("data-lead-advance")); return; }
        const del = e.target.closest("[data-lead-del]");
        if (del) { leadDelete(del.getAttribute("data-lead-del")); return; }
        const act = e.target.closest("[data-lead-act]");
        if (act) { leadAddActivity(act.getAttribute("data-lead-act")); return; }
        const golo = e.target.closest("[data-lead-goto-listing]");
        if (golo) { state.listingDetail = golo.getAttribute("data-lead-goto-listing"); state.view = "listings"; save(); render(); return; }
        const visit = e.target.closest("[data-lead-visit]");
        if (visit) { openVisitScheduler(visit.getAttribute("data-lead-visit")); return; }
        const visitStatus = e.target.closest("[data-visit-status]");
        if (visitStatus) { visitSetStatus(visitStatus.getAttribute("data-visit-id"), visitStatus.getAttribute("data-visit-status")); return; }
        const visitSave = e.target.closest("[data-visit-save]");
        if (visitSave) { visitSaveForm(); return; }
        const visitCancel = e.target.closest("[data-visit-cancel]");
        if (visitCancel) { closeVisitModal(); return; }
        const saveBtn = e.target.closest("[data-lead-save]");
        if (saveBtn) { leadSaveForm(); return; }
        const cancel = e.target.closest("[data-lead-cancel]");
        if (cancel) { closeLeadModal(); return; }
      });
    }
    const f = state.leadFilters = state.leadFilters || {};
    const bind = (id, key, evt) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(evt || "change", () => {
        state.leadFilters[key] = el.value;
        save();
        const res = $("#lead-results");
        if (res) res.innerHTML = leadBoardHTML();
      });
    };
    bind("lf-q", "q", "input");
    bind("lf-type", "type"); bind("lf-status", "status"); bind("lf-source", "source"); bind("lf-agent", "agent");
    bind("lf-minb", "minBudget", "input");
  }
  function ensureLeads() {
    if (!state.leads || !state.leads.length) state.leads = seedLeads();
    if (!state.leadFilters) state.leadFilters = {};
  }
  function seedLeads() {
    const mk = (o, i) => Object.assign({
      id: "lead-seed-" + (i + 1),
      ref: "LD-" + String(i + 1).padStart(4, "0"),
      createdAt: new Date(Date.now() - (14 - i) * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - (14 - i) * 86400000 + 3600000).toISOString(),
      type: "buyer", status: "new", source: "listing", assignedTo: "",
      email: "", phone: "", propertyInterest: "", budget: 0, askingPrice: 0, rentBudget: 0,
      nextFollowUp: "", listingId: "", listingTitle: "", notes: "",
      activity: []
    }, o);
    const L = state.listings || [];
    const titleOf = id => { const x = L.find(z => z.id === id); return x ? x.title : ""; };
    const list = (i) => "lst-seed-" + i;
    return [
      mk({ name: "Maria Santos", type: "buyer", status: "new", source: "listing", email: "maria.santos@gmail.com", phone: "+63 917 555 0123", propertyInterest: "3BR house & lot, Cavite", budget: 5500000, assignedTo: "Anna Dela Cruz", listingId: list(1), listingTitle: titleOf(list(1)), nextFollowUp: "Fri 10am", notes: "First-time buyer, pre-approved for bank loan. Wants a village with parking.", activity: [{ date: new Date(Date.now() - 86400000).toISOString(), text: "Inquiry from listing page." }] }, 1),
      mk({ name: "Ramon Garcia", type: "buyer", status: "contacted", source: "facebook", email: "ramon.g@gmail.com", phone: "+63 917 555 0124", propertyInterest: "Studio / 1BR condo, Makati or BGC", budget: 7200000, assignedTo: "Anna Dela Cruz", listingId: list(2), listingTitle: titleOf(list(2)), nextFollowUp: "Mon 2pm", activity: [{ date: new Date(Date.now() - 3 * 86400000).toISOString(), text: "Messaged about pre-selling condo; sent brochure." }] }, 2),
      mk({ name: "Liza Mendoza", type: "seller", status: "site-visit", source: "referral", email: "liza.mendoza@yahoo.com", phone: "+63 917 555 0125", propertyInterest: "Selling residential lot in Lipa", budget: 0, askingPrice: 1500000, assignedTo: "Joshua Reyes", listingId: list(3), listingTitle: titleOf(list(3)), nextFollowUp: "Sat 9am", notes: "Referred by a past client. Lot is flat, near main road.", activity: [{ date: new Date(Date.now() - 5 * 86400000).toISOString(), text: "Site visit scheduled — will bring survey." }] }, 3),
      mk({ name: "Paolo Torres", type: "investor", status: "offer", source: "listing", email: "paolo.t@gmail.com", phone: "+63 917 555 0126", propertyInterest: "Townhouse with rental upside, QC", budget: 5000000, assignedTo: "Joshua Reyes", listingId: list(4), listingTitle: titleOf(list(4)), nextFollowUp: "Thu 4pm", activity: [{ date: new Date(Date.now() - 6 * 86400000).toISOString(), text: "Submitted letter of intent on the QC townhouse." }] }, 4),
      mk({ name: "Sofia Ramirez", type: "buyer", status: "negotiation", source: "listing", email: "sofia.r@gmail.com", phone: "+63 917 555 0127", propertyInterest: "RFO condo, BGC", budget: 9800000, assignedTo: "Anna Dela Cruz", listingId: list(5), listingTitle: titleOf(list(5)), nextFollowUp: "Wed 11am", notes: "Negotiating on price; asked for seller concession on condo dues.", activity: [{ date: new Date(Date.now() - 8 * 86400000).toISOString(), text: "Counter-offer received — reviewing with seller." }] }, 5),
      mk({ name: "Miguel Lopez", type: "buyer", status: "closed", source: "website", email: "miguel.lopez@gmail.com", phone: "+63 917 555 0128", propertyInterest: "House & lot, Cebu", budget: 7000000, assignedTo: "Joshua Reyes", listingId: list(6), listingTitle: titleOf(list(6)), nextFollowUp: "", notes: "Closed on the Banilad property. Referred two friends.", activity: [{ date: new Date(Date.now() - 12 * 86400000).toISOString(), text: "Deal closed — keys handed over." }] }, 6),
      mk({ name: "Carla Aquino", type: "buyer", status: "lost", source: "listing", email: "carla.a@yahoo.com", phone: "+63 917 555 0129", propertyInterest: "Foreclosed house, Manila", budget: 2500000, assignedTo: "Anna Dela Cruz", listingId: list(7), listingTitle: titleOf(list(7)), nextFollowUp: "", notes: "Chose a different bank property.", activity: [{ date: new Date(Date.now() - 13 * 86400000).toISOString(), text: "Went with another listing; marked lost." }] }, 7),
      mk({ name: "Dexter Lim", type: "renter", status: "contacted", source: "listing", email: "dex.lim@gmail.com", phone: "+63 917 555 0130", propertyInterest: "3BR townhouse for rent, Bacoor", budget: 0, rentBudget: 15000, assignedTo: "", listingId: list(12), listingTitle: titleOf(list(12)), nextFollowUp: "Tue 5pm", activity: [{ date: new Date(Date.now() - 2 * 86400000).toISOString(), text: "Asked about lease terms and pet policy." }] }, 8),
      mk({ name: "Nina Reyes", type: "investor", status: "new", source: "market", email: "nina.reyes@gmail.com", phone: "+63 917 555 0131", propertyInterest: "Agricultural land, Nueva Ecija", budget: 3000000, assignedTo: "", listingId: list(9), listingTitle: titleOf(list(9)), notes: "Saw the listing on Market Scan; wants due diligence on irrigation.", activity: [] }, 9),
      mk({ name: "Kevin Tan", type: "buyer", status: "site-visit", source: "referral", email: "kevin.tan@gmail.com", phone: "+63 917 555 0132", propertyInterest: "Pre-selling studio condo, Pasig", budget: 4500000, assignedTo: "Joshua Reyes", listingId: list(11), listingTitle: titleOf(list(11)), nextFollowUp: "Sun 10am", activity: [{ date: new Date(Date.now() - 4 * 86400000).toISOString(), text: "Site visit to the model unit arranged." }] }, 10),
      mk({ name: "Denise Lim", type: "buyer", status: "contacted", source: "website", email: "denise.lim@gmail.com", phone: "+63 917 555 0133", propertyInterest: "2BR condo, Ortigas", budget: 6200000, assignedTo: "Demo User", listingId: list(2), listingTitle: titleOf(list(2)), nextFollowUp: "Wed 3pm", notes: "Demo agent's own lead — should only be visible to Demo User (agent).", activity: [{ date: new Date(Date.now() - 86400000).toISOString(), text: "Asked for floor plans via website form." }] }, 11),
      mk({ name: "Andres Cruz", type: "seller", status: "new", source: "referral", email: "andres.cruz@gmail.com", phone: "+63 917 555 0134", propertyInterest: "Selling 2-storey house in Antipolo", budget: 0, askingPrice: 8800000, assignedTo: "Demo User", listingId: list(7), listingTitle: titleOf(list(7)), nextFollowUp: "Fri 11am", notes: "Demo agent's own lead.", activity: [{ date: new Date(Date.now() - 2 * 86400000).toISOString(), text: "Referred by existing client." }] }, 12)
    ];
  }

  /* ================= SALES PLAYBOOK ================= */
  const PLAYBOOK_STAGES = ["Lead Generation", "Initial Consultation", "Property Matching", "Site Viewing", "Price Negotiation", "Reservation", "Contract to Sell", "Financing", "Turnover", "Post-Sale"];
  const PLAYBOOK_CATEGORIES = ["OFW Buyer", "First-Time Homebuyer", "End-User", "Investor", "Balikbayan", "Relocating Expat", "Corporate Lease", "Developer Bulk"];
  const PLAYBOOK_TYPES = ["Condominium", "House & Lot", "Townhouse", "Shophouse", "Lot Only", "Warehouse", "Mixed-Use", "Farm Lot"];
  const PLAYBOOK_SECTION_FIELDS = [
    ["objective", "Objective"], ["openingScript", "Opening script"], ["discoveryQuestions", "Discovery questions"],
    ["qualificationChecklist", "Qualification checklist"], ["valueProposition", "Value proposition"],
    ["presentationSteps", "Presentation steps"], ["objectionResponses", "Objection-handling responses"],
    ["closingScript", "Closing script"], ["followUpSequence", "Follow-up sequence"], ["coachingNotes", "Internal coaching notes"]
  ];
  let cloudPlaybooksReady = null;
  const PLAYBOOK_SEED_ITEMS = window.ESREALTY_PLAYBOOK_SEED || [];
  let playbookHooked = false;
  let playbookSearchTimer = null;
  let playbookReturnFocus = null;

  function playbookAllowed() { return roleIs("super-admin") && can("playbook.manage"); }
  function playbookUsesCloud() { return !!(SB && currentUser && currentUser.id && !currentUser.demo && currentUser.registrationStatus === "approved"); }
  function playbookWritable() { return !playbookUsesCloud() || cloudPlaybooksReady === "ok"; }
  async function seedStarterPlaybooks(btn) {
    if (!playbookAllowed()) { toast("Super Admin access required", "err"); return; }
    if (!PLAYBOOK_SEED_ITEMS.length) { toast("Starter playbooks unavailable", "err"); return; }
    if (btn) btn.disabled = true;
    try {
      let n = 0;
      if (playbookUsesCloud()) {
        if (!playbookWritable()) throw new Error("Cloud playbooks are unavailable until the data loads successfully");
        for (const item of PLAYBOOK_SEED_ITEMS) {
          const rec = normalizePlaybook({ title: item.title, summary: item.summary, category: item.category, salesStage: item.sales_stage, propertyType: item.property_type, targetCustomer: item.target_customer, status: item.status, sections: item.sections, sortOrder: item.sort_order });
          await persistPlaybook(rec, true);
          n++;
        }
        await loadCloudPlaybooks();
      } else {
        PLAYBOOK_SEED_ITEMS.forEach(item => {
          state.salesPlaybooks.push(normalizePlaybook({ title: item.title, summary: item.summary, category: item.category, salesStage: item.sales_stage, propertyType: item.property_type, targetCustomer: item.target_customer, status: item.status, sections: item.sections, sortOrder: item.sort_order }));
          n++;
        });
        save();
      }
      toast("Loaded " + n + " starter playbooks");
      render();
    } catch (error) {
      if (btn) btn.disabled = false;
      const msg = String(error.message || error || "");
      if (/23514|check constraint/i.test(msg)) {
        toast("Your database still has legacy playbook rules. Run supabase/fix_playbook_constraints.sql once in the Supabase SQL Editor, then click Load starter playbooks again.", "err");
      } else {
        toast("Could not load starter playbooks: " + esc(friendlyErr(error.message)), "err");
      }
    }
  }
  function blankPlaybookSections() {
    const result = {};
    PLAYBOOK_SECTION_FIELDS.forEach(x => { result[x[0]] = ""; });
    return result;
  }
  function normalizePlaybook(raw) {
    raw = raw || {};
    return {
      id: raw.id || "",
      title: raw.title || "",
      summary: raw.summary || "",
      category: raw.category || "General",
      salesStage: raw.salesStage || raw.sales_stage || "Discovery",
      propertyType: raw.propertyType || raw.property_type || "All Properties",
      targetCustomer: raw.targetCustomer || raw.target_customer || "",
      status: ["draft", "active", "archived"].indexOf(raw.status) >= 0 ? raw.status : "draft",
      sections: Object.assign(blankPlaybookSections(), raw.sections || {}),
      sortOrder: Number(raw.sortOrder != null ? raw.sortOrder : raw.sort_order) || 0,
      createdBy: raw.createdBy || raw.created_by || "",
      createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString()
    };
  }
  function playbookFromRow(row) { return normalizePlaybook(row); }
  function playbookToRow(rec) {
    return {
      title: rec.title,
      summary: rec.summary,
      category: rec.category,
      sales_stage: rec.salesStage,
      property_type: rec.propertyType,
      target_customer: rec.targetCustomer,
      status: rec.status,
      sections: rec.sections,
      sort_order: rec.sortOrder
    };
  }
  function playbookErrorText(error) {
    return String((error && (error.message || error.details || error.hint)) || error || "");
  }
  function playbookPermissionError(error) {
    return /(42501|42504|permission denied|row-level security|violates row-level)/i.test(playbookErrorText(error));
  }
  function playbookMissingSchema(error) {
    const text = playbookErrorText(error);
    if (playbookPermissionError(error)) return false;
    return /(PGRST205|PGRST202|could not find the table|does not exist|schema cache|querying schema)/i.test(text);
  }
  async function loadCloudPlaybooks() {
    if (!playbookAllowed()) { cloudPlaybooksReady = null; return; }
    if (!playbookUsesCloud()) { cloudPlaybooksReady = "local"; state.salesPlaybooks = (state.salesPlaybooks || []).map(normalizePlaybook); return; }
    try {
      const { data, error } = await SB.from("sales_playbooks").select("id,title,summary,category,sales_stage,property_type,target_customer,status,sections,sort_order,created_by,created_at,updated_at").order("sort_order", { ascending: true }).order("updated_at", { ascending: false });
      if (error) {
        cloudPlaybooksReady = playbookMissingSchema(error) ? "missing" : "error";
        return;
      }
      state.salesPlaybooks = (data || []).map(playbookFromRow);
      cloudPlaybooksReady = "ok";
    } catch (error) { cloudPlaybooksReady = "error"; }
  }
  async function persistPlaybook(rec, isNew, expectedUpdatedAt) {
    if (!playbookAllowed()) throw new Error("Super Admin access required");
    if (!playbookUsesCloud()) return rec;
    let result;
    if (isNew) {
      result = await SB.from("sales_playbooks").insert(playbookToRow(rec)).select("id,title,summary,category,sales_stage,property_type,target_customer,status,sections,sort_order,created_by,created_at,updated_at").single();
    } else {
      let query = SB.from("sales_playbooks").update(playbookToRow(rec)).eq("id", rec.id);
      if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
      result = await query.select("id,title,summary,category,sales_stage,property_type,target_customer,status,sections,sort_order,created_by,created_at,updated_at").maybeSingle();
    }
    const { data, error } = result;
    if (error) throw error;
    if (!data) throw new Error("This playbook was changed by another administrator. Refresh before saving again.");
    return playbookFromRow(data);
  }
  async function deletePlaybookCloud(id) {
    if (!playbookAllowed()) throw new Error("Super Admin access required");
    if (!playbookUsesCloud()) return;
    const { error } = await SB.from("sales_playbooks").delete().eq("id", id);
    if (error) throw error;
  }
  function playbookOptionList(values, selected, allLabel) {
    return (allLabel ? '<option value="">' + esc(allLabel) + "</option>" : "") + values.map(value => '<option value="' + esc(value) + '"' + (value === selected ? " selected" : "") + ">" + esc(value) + "</option>").join("");
  }
  function playbookStatusLabel(status) { return status === "active" ? "Active" : status === "archived" ? "Archived" : "Draft"; }
  function playbookStatusBadge(status) { return '<span class="badge ' + (status === "active" ? "green" : status === "archived" ? "gray" : "gold") + '">' + playbookStatusLabel(status) + "</span>"; }
  function playbookFilters() {
    if (!state.playbookFilters) state.playbookFilters = { q: "", stage: "", category: "", propertyType: "", status: "" };
    return state.playbookFilters;
  }
  function playbookFiltered() {
    const f = playbookFilters();
    const q = String(f.q || "").toLowerCase();
    return (state.salesPlaybooks || []).map(normalizePlaybook).filter(rec => {
      const haystack = [rec.title, rec.summary, rec.category, rec.salesStage, rec.propertyType, rec.targetCustomer].join(" ").toLowerCase();
      return (!q || haystack.indexOf(q) >= 0) && (!f.stage || rec.salesStage === f.stage) && (!f.category || rec.category === f.category) && (!f.propertyType || rec.propertyType === f.propertyType) && (!f.status || rec.status === f.status);
    }).sort((a, b) => a.sortOrder - b.sortOrder || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  function renderPlaybook() {
    if (!playbookAllowed()) return '<div class="notice-banner">' + icon("shield", 15) + "<span><b>Super Admin access required.</b> Sales Playbook content is private.</span></div>";
    const all = (state.salesPlaybooks || []).map(normalizePlaybook);
    const filtered = playbookFiltered();
    const f = playbookFilters();
    const active = all.filter(x => x.status === "active").length;
    const draft = all.filter(x => x.status === "draft").length;
    const archived = all.filter(x => x.status === "archived").length;
    const migration = cloudPlaybooksReady === "missing" ? '<div class="notice-banner pb-migration">' + icon("shield", 15) + '<span><b>Database setup required.</b> Run <code>supabase/sales_playbooks.sql</code> in the Supabase SQL Editor before creating cloud playbooks.</span></div>' : "";
    const loadError = cloudPlaybooksReady === "error" ? '<div class="notice-banner">Could not load Sales Playbooks. Refresh and try again.</div>' : "";
    const cards = filtered.length ? filtered.map((rec, index) => {
      const objective = rec.sections.objective || rec.summary || "No objective added yet.";
      return '<article class="card pb-card"><div class="pb-card-top"><div><div class="pb-card-meta">' + playbookStatusBadge(rec.status) + '<span>' + esc(rec.salesStage) + '</span><span>' + esc(rec.category) + '</span></div><h3>' + esc(rec.title) + '</h3></div><span class="pb-index">' + String(index + 1).padStart(2, "0") + '</span></div><p>' + esc(objective) + '</p><div class="pb-tags"><span>' + esc(rec.propertyType) + '</span>' + (rec.targetCustomer ? '<span>' + esc(rec.targetCustomer) + "</span>" : "") + '</div><div class="pb-card-foot"><small>Updated ' + esc(new Date(rec.updatedAt).toLocaleDateString()) + '</small><div class="pb-actions"><button class="icon-btn" data-pb-move="-1" data-pb-id="' + esc(rec.id) + '" title="Move up">&uarr;</button><button class="icon-btn" data-pb-move="1" data-pb-id="' + esc(rec.id) + '" title="Move down">&darr;</button><button class="btn btn-ghost btn-sm" data-pb-preview="' + esc(rec.id) + '">Preview</button><button class="btn btn-ghost btn-sm" data-pb-edit="' + esc(rec.id) + '">Edit</button><button class="icon-btn" data-pb-duplicate="' + esc(rec.id) + '" title="Duplicate">' + icon("doc", 14) + '</button><button class="icon-btn" data-pb-archive="' + esc(rec.id) + '" title="' + (rec.status === "archived" ? "Restore" : "Archive") + '">' + icon(rec.status === "archived" ? "refresh" : "archive", 14) + '</button><button class="icon-btn danger" data-pb-delete="' + esc(rec.id) + '" title="Delete">' + icon("trash", 14) + "</button></div></div></article>";
    }).join("") : '<div class="pb-empty"><span>' + icon("target", 28) + '</span><h3>No playbooks found</h3><p>Create a playbook or adjust the filters.</p></div>';
    const canSeedStarters = PLAYBOOK_SEED_ITEMS.length > 0 && all.length === 0 && !f.q && !f.stage && !f.category && !f.propertyType && !f.status;
    const starterBanner = canSeedStarters ? '<div class="notice-banner pb-migration" style="align-items:center;justify-content:space-between;gap:12px"><span style="display:flex;align-items:center;gap:8px">' + icon("target", 15) + '<span><b>No playbooks yet.</b> Load 10 ready-to-use Philippine market playbooks (scripts, objections, follow-ups) in one click.</span></span><button class="btn btn-primary btn-sm" data-pb-seed' + (playbookUsesCloud() && !playbookWritable() ? " disabled" : "") + '>Load starter playbooks</button></div>' : "";
    return '<div class="pb-page"><section class="pb-hero"><div><div class="eyebrow">SUPER ADMIN / SALES ENABLEMENT</div><h1>Sales Playbook</h1><p>Build repeatable scripts, qualification steps, objection responses, and follow-up sequences for every sales conversation.</p></div><button class="btn btn-primary" data-pb-new' + (!playbookWritable() ? " disabled" : "") + '>' + icon("plus", 15) + ' New Playbook</button></section>' + migration + loadError + starterBanner + '<section class="pb-stats"><div><b>' + all.length + '</b><span>Total</span></div><div><b>' + active + '</b><span>Active</span></div><div><b>' + draft + '</b><span>Drafts</span></div><div><b>' + archived + '</b><span>Archived</span></div></section><section class="card pb-filter"><label>Search<input class="input" id="pb-filter-q" value="' + esc(f.q || "") + '" placeholder="Title, audience, property type..."></label><label>Stage<select class="input" id="pb-filter-stage">' + playbookOptionList(PLAYBOOK_STAGES, f.stage, "All stages") + '</select></label><label>Category<select class="input" id="pb-filter-category">' + playbookOptionList(PLAYBOOK_CATEGORIES, f.category, "All categories") + '</select></label><label>Property<select class="input" id="pb-filter-property">' + playbookOptionList(PLAYBOOK_TYPES, f.propertyType, "All property types") + '</select></label><label>Status<select class="input" id="pb-filter-status"><option value="">All statuses</option><option value="draft"' + (f.status === "draft" ? " selected" : "") + '>Draft</option><option value="active"' + (f.status === "active" ? " selected" : "") + '>Active</option><option value="archived"' + (f.status === "archived" ? " selected" : "") + '>Archived</option></select></label><button class="btn btn-ghost" data-pb-clear>Clear</button></section><section class="pb-grid">' + cards + "</section></div>";
  }
  function playbookEditor(id) {
    if (!playbookAllowed()) { toast("Super Admin access required", "err"); return; }
    if (!playbookWritable()) { toast(cloudPlaybooksReady === "missing" ? "Run supabase/sales_playbooks.sql first" : "Playbooks are unavailable until the cloud data loads successfully", "err"); return; }
    let rec = id ? (state.salesPlaybooks || []).map(normalizePlaybook).find(x => x.id === id) : null;
    if (!rec) {
      rec = normalizePlaybook({ status: "draft", sortOrder: (state.salesPlaybooks || []).length });
      try {
        const draft = JSON.parse(sessionStorage.getItem("esrealty_playbook_new_draft") || "null");
        if (draft && draft.title) rec = normalizePlaybook(draft);
      } catch (error) {}
    }
    const textareas = PLAYBOOK_SECTION_FIELDS.map(field => '<label class="field"><span>' + esc(field[1]) + '</span><textarea class="input" id="pb-' + field[0] + '" rows="4" maxlength="8000" placeholder="Add ' + esc(field[1].toLowerCase()) + '...">' + esc(rec.sections[field[0]] || "") + "</textarea></label>").join("");
    const ov = document.createElement("div");
    playbookReturnFocus = document.activeElement;
    ov.className = "modal-overlay"; ov.id = "pb-modal"; ov.setAttribute("data-pb-editing", rec.id || ""); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "pb-modal-title");
    ov.innerHTML = '<div class="modal-card modal-card-wide pb-modal-card"><div class="modal-head"><div><h3 id="pb-modal-title">' + (rec.id ? "Edit Playbook" : "New Sales Playbook") + '</h3><p class="dim tiny">Structured sales guidance visible only to Super Admin.</p></div><button class="icon-btn" data-pb-cancel title="Close" aria-label="Close playbook editor">&times;</button></div><div class="modal-body pb-modal-body"><div class="grid grid-2"><label class="field"><span>Title *</span><input class="input" id="pb-title" maxlength="200" value="' + esc(rec.title) + '" placeholder="Investor discovery call"></label><label class="field"><span>Status</span><select class="input" id="pb-status"><option value="draft"' + (rec.status === "draft" ? " selected" : "") + '>Draft</option><option value="active"' + (rec.status === "active" ? " selected" : "") + '>Active</option><option value="archived"' + (rec.status === "archived" ? " selected" : "") + '>Archived</option></select></label><label class="field"><span>Category</span><select class="input" id="pb-category">' + playbookOptionList(PLAYBOOK_CATEGORIES, rec.category) + '</select></label><label class="field"><span>Sales stage</span><select class="input" id="pb-stage">' + playbookOptionList(PLAYBOOK_STAGES, rec.salesStage) + '</select></label><label class="field"><span>Property type</span><select class="input" id="pb-property-type">' + playbookOptionList(PLAYBOOK_TYPES, rec.propertyType) + '</select></label><label class="field"><span>Target customer</span><input class="input" id="pb-target-customer" maxlength="200" value="' + esc(rec.targetCustomer) + '" placeholder="First-time investor"></label></div><label class="field"><span>Summary</span><textarea class="input" id="pb-summary" rows="2" maxlength="2000" placeholder="Short internal description">' + esc(rec.summary) + '</textarea></label><div class="pb-editor-sections">' + textareas + '</div><p class="dim tiny pb-draft-note">New playbook drafts are recovered during this browser session.</p></div><div class="modal-foot"><button class="btn btn-ghost" data-pb-cancel>Cancel</button><button class="btn btn-primary" data-pb-save>' + icon("check", 15) + " Save Playbook</button></div></div>";
    document.body.appendChild(ov);
    if (!id) ov.addEventListener("input", () => {
      clearTimeout(playbookSearchTimer);
      playbookSearchTimer = setTimeout(() => { try { sessionStorage.setItem("esrealty_playbook_new_draft", JSON.stringify(readPlaybookForm(rec))); } catch (error) {} }, 350);
    });
    setTimeout(() => { const title = document.getElementById("pb-title"); if (title) title.focus(); }, 30);
  }
  function readPlaybookForm(base) {
    const value = id => { const element = document.getElementById(id); return element ? element.value.trim() : ""; };
    const sections = blankPlaybookSections();
    PLAYBOOK_SECTION_FIELDS.forEach(field => { sections[field[0]] = value("pb-" + field[0]); });
    return Object.assign({}, base || {}, {
      title: value("pb-title"), status: value("pb-status") || "draft", category: value("pb-category") || "General",
      salesStage: value("pb-stage") || "Discovery", propertyType: value("pb-property-type") || "All Properties",
      targetCustomer: value("pb-target-customer"), summary: value("pb-summary"), sections: sections, updatedAt: new Date().toISOString()
    });
  }
  function closePlaybookModal() { const modal = document.getElementById("pb-modal"); if (modal) modal.remove(); if (playbookReturnFocus && playbookReturnFocus.isConnected) playbookReturnFocus.focus(); playbookReturnFocus = null; }
  function playbookPreview(id) {
    if (!playbookAllowed()) { toast("Super Admin access required", "err"); return; }
    const rec = (state.salesPlaybooks || []).map(normalizePlaybook).find(x => x.id === id);
    if (!rec) return;
    const sections = PLAYBOOK_SECTION_FIELDS.filter(field => rec.sections[field[0]]).map(field => '<section><h4>' + esc(field[1]) + '</h4><p>' + esc(rec.sections[field[0]]).replace(/\n/g, "<br>") + "</p></section>").join("");
    playbookReturnFocus = document.activeElement;
    const ov = document.createElement("div"); ov.className = "modal-overlay"; ov.id = "pb-modal"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "pb-preview-title");
    ov.innerHTML = '<div class="modal-card modal-card-wide pb-preview"><div class="modal-head"><div><div class="pb-card-meta">' + playbookStatusBadge(rec.status) + '<span>' + esc(rec.salesStage) + '</span><span>' + esc(rec.propertyType) + '</span></div><h3 id="pb-preview-title">' + esc(rec.title) + '</h3></div><button class="icon-btn" data-pb-cancel title="Close" aria-label="Close playbook preview">&times;</button></div><div class="modal-body"><p class="pb-preview-summary">' + esc(rec.summary || "No summary provided.") + '</p><div class="pb-preview-sections">' + (sections || '<div class="pb-empty"><p>No playbook sections have been completed.</p></div>') + '</div></div><div class="modal-foot"><button class="btn btn-ghost" data-pb-cancel>Close</button><button class="btn btn-primary" data-pb-edit="' + esc(rec.id) + '">Edit Playbook</button></div></div>';
    document.body.appendChild(ov);
  }
  async function savePlaybookFromModal(button) {
    if (!playbookAllowed()) { toast("Super Admin access required", "err"); return; }
    const modal = document.getElementById("pb-modal");
    const id = modal ? modal.getAttribute("data-pb-editing") : "";
    const existing = id ? (state.salesPlaybooks || []).map(normalizePlaybook).find(x => x.id === id) : null;
    let rec = readPlaybookForm(existing || normalizePlaybook({ sortOrder: (state.salesPlaybooks || []).length }));
    if (!rec.title) { toast("Playbook title is required", "err"); const title = document.getElementById("pb-title"); if (title) title.focus(); return; }
    const isNew = !existing;
    if (!playbookUsesCloud() && !rec.id) rec.id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : "pb-" + Date.now();
    if (isNew) { rec.createdAt = new Date().toISOString(); rec.createdBy = currentUser && currentUser.id || "local"; }
    if (button) button.disabled = true;
    try {
      rec = normalizePlaybook(await persistPlaybook(rec, isNew, existing && existing.updatedAt));
      const index = (state.salesPlaybooks || []).findIndex(x => x.id === rec.id || (existing && x.id === existing.id));
      if (index >= 0) state.salesPlaybooks[index] = rec; else state.salesPlaybooks.push(rec);
      if (!playbookUsesCloud()) save();
      sessionStorage.removeItem("esrealty_playbook_new_draft");
      closePlaybookModal(); render(); toast(isNew ? "Sales playbook created" : "Sales playbook updated");
    } catch (error) {
      if (playbookMissingSchema(error)) { cloudPlaybooksReady = "missing"; toast("Run supabase/sales_playbooks.sql before saving", "err"); }
      else if (playbookPermissionError(error)) { toast("The server rejected this save: your session does not pass the Super Admin check. Sign out, sign back in, and confirm this account is an approved Super Admin in Users & Access.", "err"); }
      else toast("Could not save playbook: " + esc(friendlyErr(error.message)), "err");
      if (button) button.disabled = false;
    }
  }
  async function updatePlaybookRecord(rec, message) {
    if (!playbookAllowed()) { toast("Super Admin access required", "err"); return; }
    try {
      const expectedUpdatedAt = rec.updatedAt;
      const saved = normalizePlaybook(await persistPlaybook(rec, false, expectedUpdatedAt));
      const index = state.salesPlaybooks.findIndex(x => x.id === rec.id);
      if (index >= 0) state.salesPlaybooks[index] = saved;
      if (!playbookUsesCloud()) save();
      render(); if (message) toast(message);
    } catch (error) { toast("Could not update playbook: " + esc(friendlyErr(error.message)), "err"); }
  }
  async function duplicatePlaybook(id) {
    const source = (state.salesPlaybooks || []).map(normalizePlaybook).find(x => x.id === id);
    if (!source || !playbookAllowed()) return;
    let copy = normalizePlaybook(Object.assign({}, source, { id: "", title: source.title + " (Copy)", status: "draft", sortOrder: state.salesPlaybooks.length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    if (!playbookUsesCloud()) copy.id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : "pb-" + Date.now();
    try {
      copy = normalizePlaybook(await persistPlaybook(copy, true)); state.salesPlaybooks.push(copy); if (!playbookUsesCloud()) save(); render(); toast("Playbook duplicated as a draft");
    } catch (error) { toast("Could not duplicate playbook: " + esc(friendlyErr(error.message)), "err"); }
  }
  async function removePlaybook(id) {
    if (!playbookAllowed()) { toast("Super Admin access required", "err"); return; }
    const rec = (state.salesPlaybooks || []).find(x => x.id === id);
    if (!rec || !confirm('Permanently delete "' + rec.title + '"?')) return;
    try { await deletePlaybookCloud(id); state.salesPlaybooks = state.salesPlaybooks.filter(x => x.id !== id); if (!playbookUsesCloud()) save(); render(); toast("Playbook deleted", "err"); }
    catch (error) { toast("Could not delete playbook: " + esc(friendlyErr(error.message)), "err"); }
  }
  async function movePlaybook(id, direction) {
    if (!playbookAllowed()) return;
    const ordered = (state.salesPlaybooks || []).map(normalizePlaybook).sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex(x => x.id === id); const target = index + Number(direction);
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const current = ordered[index], other = ordered[target], oldOrder = current.sortOrder;
    current.sortOrder = other.sortOrder; other.sortOrder = oldOrder;
    try {
      if (playbookUsesCloud()) {
        const { error } = await SB.rpc("swap_sales_playbook_order", { first_id: current.id, second_id: other.id });
        if (error) throw error;
      }
      state.salesPlaybooks = ordered; if (!playbookUsesCloud()) save(); render();
    } catch (error) { toast("Could not reorder playbooks: " + esc(friendlyErr(error.message)), "err"); }
  }
  function bindPlaybook() {
    if (!playbookAllowed()) { if (state.view === "playbook") { state.view = firstAllowedView(); render(); toast("Super Admin access required", "err"); } return; }
    if (cloudPlaybooksReady === null) loadCloudPlaybooks().then(() => { if (state.view === "playbook") render(); });
    const bindFilter = (id, key, eventName) => { const element = document.getElementById(id); if (!element) return; element.addEventListener(eventName || "change", () => { playbookFilters()[key] = element.value; save(); render(); }); };
    bindFilter("pb-filter-stage", "stage"); bindFilter("pb-filter-category", "category"); bindFilter("pb-filter-property", "propertyType"); bindFilter("pb-filter-status", "status");
    bindFilter("pb-filter-q", "q", "change");
    if (playbookHooked) return;
    playbookHooked = true;
    document.addEventListener("click", async event => {
      const newButton = event.target.closest("[data-pb-new]"); if (newButton) { if (!newButton.disabled) playbookEditor(""); return; }
      const cancel = event.target.closest("[data-pb-cancel]"); if (cancel) { closePlaybookModal(); return; }
      const saveButton = event.target.closest("[data-pb-save]"); if (saveButton) { await savePlaybookFromModal(saveButton); return; }
      const preview = event.target.closest("[data-pb-preview]"); if (preview) { playbookPreview(preview.getAttribute("data-pb-preview")); return; }
      const edit = event.target.closest("[data-pb-edit]"); if (edit) { closePlaybookModal(); playbookEditor(edit.getAttribute("data-pb-edit")); return; }
      const duplicate = event.target.closest("[data-pb-duplicate]"); if (duplicate) { await duplicatePlaybook(duplicate.getAttribute("data-pb-duplicate")); return; }
      const archive = event.target.closest("[data-pb-archive]"); if (archive) { const rec = state.salesPlaybooks.map(normalizePlaybook).find(x => x.id === archive.getAttribute("data-pb-archive")); if (rec) { rec.status = rec.status === "archived" ? "draft" : "archived"; await updatePlaybookRecord(rec, rec.status === "archived" ? "Playbook archived" : "Playbook restored as draft"); } return; }
      const remove = event.target.closest("[data-pb-delete]"); if (remove) { await removePlaybook(remove.getAttribute("data-pb-delete")); return; }
      const move = event.target.closest("[data-pb-move]"); if (move) { await movePlaybook(move.getAttribute("data-pb-id"), move.getAttribute("data-pb-move")); return; }
      const seedBtn = event.target.closest("[data-pb-seed]"); if (seedBtn) { seedStarterPlaybooks(seedBtn); return; }
    const clear = event.target.closest("[data-pb-clear]"); if (clear) { state.playbookFilters = { q: "", stage: "", category: "", propertyType: "", status: "" }; save(); render(); }
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && document.getElementById("pb-modal")) closePlaybookModal(); });
  }

  /* ================= BROKERAGE: ROLES, i18n, USERS ================= */
  const FIL_TITLES = { dashboard: "Dashboard", wizard: "Bagong Investment", deal: "Pagsusuri ng Deal", portfolio: "Portfolio", pms: "Pamamahala ng Ari-arian", assistant: "AI Katulong", reports: "Mga Ulat", appraisal: "Pagtatasa", market: "Market Scan", listings: "Mga Listahan", leads: "CRM / Mga Leads", transactions: "Mga Transaksyon", financing: "Pagpopondo", playbook: "Sales Playbook", users: "Mga User at Access", admin: "Brokerage", settings: "Mga Setting" };
  const LANG_NAV = { dashboard: ["Dashboard", "Dashboard"], wizard: ["New Investment", "Bagong Investment"], deal: ["Deal Analysis", "Pagsusuri ng Deal"], appraisal: ["Appraisal", "Pagtatasa"], market: ["Market Scan", "Market Scan"], leads: ["CRM / Leads", "CRM / Mga Leads"], listings: ["Listings", "Mga Listahan"], portfolio: ["Portfolio", "Portfolio"], pms: ["Property Manager", "Pamamahala ng Ari-arian"], assistant: ["AI Assistant", "AI Katulong"], reports: ["Reports", "Mga Ulat"], transactions: ["Transactions", "Mga Transaksyon"], financing: ["Financing", "Pagpopondo"], playbook: ["Sales Playbook", "Sales Playbook"], users: ["Users", "Mga User"], admin: ["Brokerage", "Brokerage"], settings: ["Settings", "Mga Setting"] };
  const LANG_SECTIONS = { ANALYSIS: ["ANALYSIS", "PAGSUSURI"], WORKSPACE: ["WORKSPACE", "WORKSPACE"], BROKERAGE: ["BROKERAGE", "BROKERAGE"], ACCOUNT: ["ACCOUNT", "ACCOUNT"] };
  let lang = "en";
  function setLang(l) { lang = (l === "fil") ? "fil" : "en"; state.lang = lang; save(); render(); }
  function toggleLang() { setLang(lang === "en" ? "fil" : "en"); }

  function roleIs() { const r = userRole(); return Array.prototype.slice.call(arguments).indexOf(r) >= 0; }
  const ROLE_CAPABILITIES = {
    "super-admin": ["*"],
    broker: ["dashboard.view", "presell.view", "appraisal.view", "market.view", "leads.view", "leads.manage", "listings.view", "listings.manage", "transactions.view", "transactions.manage", "financing.view", "financing.manage", "assistant.view", "brokerage.view", "commission.manage", "payout.approve", "inventory.view", "agents.supervise", "settings.view"],
    agent: ["dashboard.view", "presell.view", "leads.view", "leads.manage", "listings.view", "listings.manage", "transactions.view", "transactions.manage", "financing.view", "financing.manage", "assistant.view", "settings.view"],
    buyer: ["presell.view", "buyer.portal.view", "listings.view", "financing.view", "assistant.view", "reports.view", "settings.view"],
    seller: ["dashboard.view", "presell.view", "listings.view", "financing.view", "assistant.view", "reports.view", "settings.view"],
    owner: ["pms.view", "settings.view"],
    tenant: ["pms.view", "settings.view"]
  };
  const VIEW_CAPABILITY = { dashboard: "dashboard.view", wizard: "investments.manage", deal: "investments.manage", appraisal: "appraisal.view", market: "market.view", leads: "leads.view", listings: "listings.view", transactions: "transactions.view", financing: "financing.view", portfolio: "portfolio.view", presell: "presell.view", portal: "buyer.portal.view", pms: "pms.view", assistant: "assistant.view", reports: "reports.view", playbook: "playbook.manage", users: "users.manage", admin: "brokerage.view", settings: "settings.view" };
  function can(capability) {
    const caps = ROLE_CAPABILITIES[userRole()] || [];
    return caps.indexOf("*") >= 0 || caps.indexOf(capability) >= 0;
  }
  function canManageUsers() { return can("users.manage"); }
  function canBroker() { return can("brokerage.view"); }
  function canSell() { return can("listings.manage"); }
  function navAllowed(view) {
    return can(VIEW_CAPABILITY[view] || "dashboard.view");
  }
  function listingCanManage() { return can("listings.manage"); }
  function canSeePortfolioValue() { return roleIs("super-admin"); }

  function ensureBrokerage() {
    lang = (state && state.lang) || "en";
    if (!state.users || !state.users.length) state.users = seedUsers();
    (state.users || []).forEach(u => { if (u.role === "admin") u.role = "super-admin"; });
    if (!state.commission) state.commission = { settings: { grossPct: 3, brokerShare: 40, agentShare: 50, referralShare: 10 }, payouts: [] };
    if (!state.commission.settings) state.commission.settings = { grossPct: 3, brokerShare: 40, agentShare: 50, referralShare: 10 };
    const cs = state.commission.settings;
    if (!Number.isFinite(Number(cs.grossPct))) cs.grossPct = C.num(cs.brokerPct, 3);
    if (!Number.isFinite(Number(cs.brokerShare))) cs.brokerShare = 40;
    if (!Number.isFinite(Number(cs.agentShare))) cs.agentShare = 50;
    if (!Number.isFinite(Number(cs.referralShare))) cs.referralShare = 10;
    if (!state.commission.payouts) state.commission.payouts = [];
    if (!state.docVault) state.docVault = [];
    if (!state.siteVisits) state.siteVisits = [];
    if (!state.financingScenarios) state.financingScenarios = [];
    if (!state.financingDraft) state.financingDraft = null;
    if (!state.listingStats) state.listingStats = {};
    if (!state.campaigns) state.campaigns = [];
    if (!state.transactions) state.transactions = [];
    ensureDeals();
    if (!state.transactions.length && (!currentUser || currentUser.demo || (IS_LOCAL_DEV && !currentUser.id))) state.transactions = seedTransactions();
    if (!state.adminTab) state.adminTab = "overview";
    if ((currentUser && currentUser.demo) || (IS_LOCAL_DEV && (!currentUser || !currentUser.id))) seedPmsSample();
  }
  function ensureDeals() {
    if (!state.deals || !state.deals.length) {
      try {
        const data1 = sampleDeal();
        const rec1 = C.recommend(data1);
        const data2 = freshDeal();
        Object.assign(data2.property, {
          name: "Tagaytay Ridge Investment Lot",
          province: "Cavite",
          city: "Tagaytay",
          barangay: "Mahogany",
          address: "Brgy. Mahogany, Tagaytay City",
          lat: "14.1070",
          lng: "120.9600",
          lotArea: 180,
          frontage: 10,
          depth: 18,
          roadWidth: 8,
          roadType: "City Road",
          landUse: "Residential",
          zoning: "Residential",
          floodRisk: "Low",
          propertyType: "Vacant Lot",
          marketValuePerSqm: 22000,
          growthRate: 0.08
        });
        data2.purchase = { price: 3600000, negotiatedPrice: 3400000, sellerType: "Owner", taxes: 0, transferFees: 52000, legalFees: 45000, surveyCost: 25000, miscCost: 20000 };
        data2.financing = { type: "Bank Loan", loanPct: 65, interestRate: 7.0, years: 15 };
        data2.development = Object.assign(data2.development, { devType: "Subdivision", lots: 4, lotSqm: 180, roadPct: 18, openSpacePct: 8, lotDevCostPerSqm: 6200, buildMonths: 12 });
        data2.sales = Object.assign(data2.sales, { saleMode: "sell", lots: 4, occupancyPct: 100 });
        data2.location = Object.assign(data2.location, { nearby: { "School": true, "Market": true, "Restaurant": true, "Transit": true }, accessibilityScore: 72, populationScore: 65, futureDevScore: 78, commercialGrowthScore: 68 });
        data2.comparables = [
          { id: "tl-1", type: "Sale", address: "Mahogany Ave., Tagaytay", city: "Tagaytay", price: 3800000, floorArea: 0, lotArea: 170, date: "2026-02-10", source: "Broker" },
          { id: "tl-2", type: "Sale", address: "Silang Junction South", city: "Tagaytay", price: 3950000, floorArea: 0, lotArea: 190, date: "2025-12-18", source: "Listings" }
        ];
        const rec2 = C.recommend(data2);
        state.deals = [{
          id: "d-seed-1",
          createdAt: Date.now() - 20 * 86400000,
          status: "acquired",
          grade: rec1.grade,
          data: JSON.parse(JSON.stringify(data1))
        }, {
          id: "d-seed-2",
          createdAt: Date.now() - 12 * 86400000,
          status: "acquired",
          grade: rec2.grade,
          data: JSON.parse(JSON.stringify(data2))
        }];
      } catch (e) {}
    }
  }
  function seedPmsSample() {
    if (!state.pms) state.pms = {};
    const empty = ["properties", "units", "owners", "tenants", "leases", "payments", "maintenance", "expenses", "documents"];
    empty.forEach(k => { if (!Array.isArray(state.pms[k])) state.pms[k] = []; });
    const today = new Date();
    const d = n => new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);
    if (!state.pms.tenants.length) {
      state.pms.tenants.unshift({
        id: "t-seed-1",
        name: "Katrina Reyes",
        email: "demo@esrealty.ph",
        phone: "+63 917 555 0184",
        employment: "Software Engineer, BGC Tech Solutions",
        monthly_income: 65000,
        owner_id: "o-seed-1",
        notes: "Sample tenant record — linked to Unit 3B, One Orchard Residences. ID: PH1234567. Guarantor: Carlos Reyes.",
        createdAt: today.getTime() - 90 * 86400000,
        archived: false
      });
    }
    const seedTenant = state.pms.tenants.find(t => t.id === "t-seed-1" || t.name === "Katrina Reyes");
    if (seedTenant && seedTenant.email !== "demo@esrealty.ph") { seedTenant.email = "demo@esrealty.ph"; }
    if (!state.pms.owners.length) {
      state.pms.owners.unshift({
        id: "o-seed-1",
        name: "Carlos Villanueva",
        email: "demo@esrealty.ph",
        phone: "+63 918 555 0192",
        company: "Villanueva Realty Holdings",
        bank: "BDO",
        account_number: "1234-5678-9012",
        account_name: "Carlos Villanueva",
        notes: "Sample owner of One Orchard Residences.",
        createdAt: today.getTime() - 120 * 86400000,
        archived: false
      });
    }
    const seedOwner = state.pms.owners.find(o => o.id === "o-seed-1" || o.name === "Carlos Villanueva");
    if (seedOwner && seedOwner.email !== "demo@esrealty.ph") { seedOwner.email = "demo@esrealty.ph"; }
    if (seedOwner) ensureOwnerAccount(seedOwner);
    if (!state.pms.properties.length) {
      state.pms.properties.unshift({
        id: "p-seed-1",
        owner_id: "o-seed-1",
        title: "One Orchard Residences",
        type: "Residential",
        status: "leased",
        price: 18500000,
        rent: 28000,
        address: "No. 12 Orchard Road",
        barangay: "San Antonio",
        city: "Pasig",
        province: "NCR",
        amenities: ["Pool", "Gym", "Elevator", "Parking"],
        description: "Sample residential condominium used for the tenant demo.",
        createdAt: today.getTime() - 120 * 86400000,
        archived: false
      });
    }
    if (!state.pms.units.length) {
      state.pms.units.unshift({
        id: "u-seed-1",
        property_id: "p-seed-1",
        unit_number: "3B",
        status: "occupied",
        bedrooms: 1,
        bathrooms: 1,
        size: 32,
        rent_amount: 28000,
        tenant_name: "Katrina Reyes",
        notes: "Sample unit — occupied by the demo tenant.",
        createdAt: today.getTime() - 90 * 86400000,
        archived: false
      });
    }
    if (!state.pms.leases.length) {
      state.pms.leases.unshift({
        id: "l-seed-1",
        property_id: "p-seed-1",
        unit_id: "u-seed-1",
        tenant_id: "t-seed-1",
        owner_id: "o-seed-1",
        start: d(90),
        end: d(-275),
        rent_type: "monthly",
        rent: 28000,
        deposit: 56000,
        due_day: "10",
        status: "active",
        notes: "Sample 12-month lease for the tenant demo.",
        createdAt: today.getTime() - 90 * 86400000,
        archived: false
      });
    }
    if (!state.pms.payments.length) {
      state.pms.payments.unshift(
        { id: "pay-seed-1", lease_id: "l-seed-1", property_id: "p-seed-1", unit_id: "u-seed-1", tenant_id: "t-seed-1", amount: 28000, date: d(10), month: "2026-07", method: "GCash", status: "paid", notes: "July rent", createdAt: today.getTime() - 10 * 86400000, archived: false },
        { id: "pay-seed-2", lease_id: "l-seed-1", property_id: "p-seed-1", unit_id: "u-seed-1", tenant_id: "t-seed-1", amount: 28000, date: d(40), month: "2026-06", method: "Bank Transfer", status: "paid", notes: "June rent", createdAt: today.getTime() - 40 * 86400000, archived: false }
      );
    }
    if (!state.pms.maintenance.length) {
      state.pms.maintenance.unshift(
        { id: "m-seed-1", title: "AC unit maintenance — Unit 3B", unit_id: "u-seed-1", property_id: "p-seed-1", category: "HVAC", priority: "high", status: "in progress", cost: 3500, vendor: "CoolAir PH", date: d(6), notes: "Annual AC cleaning and recharge.", createdAt: today.getTime() - 6 * 86400000, archived: false },
        { id: "m-seed-2", title: "Hallway light replacement", unit_id: "", property_id: "p-seed-1", category: "Electrical", priority: "low", status: "completed", cost: 1200, vendor: "JM Electrical", date: d(25), notes: "Replaced 3 hallway bulbs.", createdAt: today.getTime() - 25 * 86400000, archived: false }
      );
    }
    if (!state.pms.expenses.length) {
      state.pms.expenses.unshift(
        { id: "e-seed-1", property_id: "p-seed-1", category: "Association Dues", amount: 3200, date: d(12), description: "Monthly condo association dues", createdAt: today.getTime() - 12 * 86400000, archived: false },
        { id: "e-seed-2", property_id: "p-seed-1", category: "Property Tax", amount: 21500, date: d(55), description: "Annual real property tax (2026)", createdAt: today.getTime() - 55 * 86400000, archived: false }
      );
    }
    if (!state.pms.documents.length) {
      state.pms.documents.unshift(
        { id: "d-seed-1", name: "One Orchard Residences — Lease Agreement (Unit 3B)", type: "PDF", category: "Lease", property_id: "p-seed-1", unit_id: "u-seed-1", date: d(90), notes: "Signed 12-month lease with Katrina Reyes.", createdAt: today.getTime() - 90 * 86400000, archived: false },
        { id: "d-seed-2", name: "Condominium Certificate of Title", type: "PDF", category: "Deed", property_id: "p-seed-1", unit_id: "", date: d(120), notes: "TCT copy on file.", createdAt: today.getTime() - 120 * 86400000, archived: false }
      );
    }
    (state.pms.leases || []).forEach(l => {
      if (l.archived) return;
      const t = (state.pms.tenants || []).find(x => x.id === l.tenant_id);
      if (t) ensureTenantAccount(t, l);
    });
  }
  function seedUsers() {
    const ago = d => new Date(Date.now() - d * 86400000).toISOString();
    return [
      { id: "u-super", name: "Elena Santos", email: "elena@esrealty.ph", role: "super-admin", prc: "", resa: "", agency: "ES Realty Group", active: true, createdAt: ago(120) },
      { id: "u-broker", name: "Marco Villanueva", email: "broker@esrealty.ph", role: "broker", prc: "0012345", prcVerified: true, resa: "RESA-2024-0881", agency: "Villanueva & Co.", active: true, createdAt: ago(100) },
      { id: "u-anna", name: "Anna Dela Cruz", email: "anna@esrealty.ph", role: "agent", broker: "u-broker", prc: "", agency: "Villanueva & Co.", active: true, createdAt: ago(80) },
      { id: "u-joshua", name: "Joshua Reyes", email: "josh@esrealty.ph", role: "agent", broker: "u-broker", prc: "", agency: "Villanueva & Co.", active: true, createdAt: ago(70) },
      { id: "u-demo-buyer", name: "Maria Santos", email: "buyer@esrealty.ph", role: "buyer", active: true, createdAt: ago(20) },
      { id: "u-demo-seller", name: "Liza Mendoza", email: "seller@esrealty.ph", role: "seller", active: true, createdAt: ago(15) }
    ];
  }
  function prcValid(num) { return /^\d{12}$/.test(String(num || "").trim()) || /^\d{6,7}$/.test(String(num || "").trim()); }
  function userName(id) { const u = (state.users || []).find(x => x.id === id); return u ? u.name : ""; }
  function agentUsers() { return (state.users || []).filter(u => u.role === "agent" && u.active !== false); }
  function brokerUsers() { return (state.users || []).filter(u => (u.role === "broker" || u.role === "super-admin") && u.active !== false); }
  function userBadge(role) {
    const map = { "super-admin": "gold", broker: "purple", agent: "blue", buyer: "green", seller: "cyan", owner: "blue", tenant: "gray" };
    return '<span class="badge ' + (map[role] || "blue") + '">' + esc(roleLabel(role)) + "</span>";
  }
  function userCard(u) {
    const mgr = canManageUsers();
    return '<div class="user-card card card-pad">' +
      '<div class="row" style="gap:12px;align-items:flex-start">' + leadAvatar(u.name) +
      '<div class="grow"><div class="lead-card-name">' + esc(u.name) + (u.active === false ? ' <span class="dim tiny">(inactive)</span>' : "") + "</div>" +
      '<div class="dim tiny">' + esc(u.email || "") + (u.agency ? " · " + esc(u.agency) : "") + "</div>" +
      '<div class="row mt-8" style="gap:6px;flex-wrap:wrap">' + userBadge(u.role) +
      (u.prc ? '<span class="chip">PRC ' + esc(u.prc) + (u.prcVerified ? ' <span style="color:#34C77B">verified</span>' : "") + "</span>" : "") +
      (u.resa ? '<span class="chip">' + esc(u.resa) + "</span>" : "") +
      (u.broker ? '<span class="chip">Under ' + esc(userName(u.broker) || "Broker") + "</span>" : "") + "</div></div>" +
      (mgr ? '<button class="icon-btn btn-sm" data-user-edit="' + esc(u.id) + '" title="Edit">' + icon("edit", 14) + "</button>" : "") +
      (mgr ? '<button class="icon-btn btn-sm danger" data-user-del="' + esc(u.id) + '" title="Delete">' + icon("trash", 14) + "</button>" : "") +
      "</div></div>";
  }
  function cloudUserCard(u) {
    const roleOpts = ROLES.map(r => '<option value="' + esc(r.value) + '"' + (u.role === r.value ? " selected" : "") + ">" + esc(r.label) + "</option>").join("");
    const pending = u.registration_status === "pending";
    const rejected = u.registration_status === "rejected";
    const statusClass = u.registration_status === "approved" ? "green" : u.registration_status === "rejected" ? "red" : "gold";
    const reqRole = u.requested_role ? '<span class="user-requested">Requested role: ' + esc(roleLabel(u.requested_role)) + '</span>' : "";
    const extra = [];
    if (u.agency) extra.push('<span class="chip">' + esc(u.agency) + "</span>");
    if (u.prc) extra.push('<span class="chip">PRC ' + esc(u.prc) + "</span>");
    if (u.resa) extra.push('<span class="chip">' + esc(u.resa) + "</span>");
    const pmsOwner = (pms().owners || []).find(o => o.archived !== true && String(o.authUserId || "") === String(u.id || ""));
    if (pmsOwner) extra.push('<span class="chip">PMS owner: ' + esc(pmsOwner.name || pmsOwner.email) + "</span>");
    const pmsTenant = (pms().tenants || []).find(t => t.archived !== true && String(t.authUserId || "") === String(u.id || ""));
    if (pmsTenant) extra.push('<span class="chip">PMS tenant: ' + esc(pmsTenant.name || pmsTenant.email) + "</span>");
    const brokerName = u.broker ? (remoteProfiles.find(p => p.id === u.broker) || {}).full_name || "" : "";
    if (brokerName) extra.push('<span class="chip">Under ' + esc(brokerName) + "</span>");
    const brokers = remoteProfiles.filter(p => p.role === "broker" && p.registration_status === "approved");
    const opts = '<option value="">No broker</option>' + brokers.map(b => '<option value="' + esc(b.id) + '"' + (u.broker === b.id ? " selected" : "") + ">" + esc(b.full_name || b.email) + (b.prc ? " · PRC " + esc(b.prc) : "") + "</option>").join("");
    const brokerField = '<div class="field cloud-broker-field"' + (u.role === "agent" ? "" : ' style="display:none"') + '><label>Supervising broker (agents)</label><select class="input" data-cloud-broker="' + esc(u.id) + '">' + opts + '</select></div>';
    const canDel = rejected && state.usersTab === "rejected";
    const primaryLabel = pending ? "Approve account" : (rejected ? "Restore access" : "Save changes");
    const actions = '<button class="btn btn-primary btn-sm" data-profile-action="approved" data-profile-id="' + esc(u.id) + '">' + icon(pending ? "check" : (rejected ? "refresh" : "check"), 14) + " " + primaryLabel + '</button>' +
      (!rejected ? '<button class="btn btn-ghost btn-sm" data-cloud-reset-pass="' + esc(u.id) + '" title="Generate a new temporary password">' + icon("key", 14) + " Reset password</button>" : "") +
      (!rejected ? '<button class="btn btn-ghost btn-sm danger" data-profile-action="rejected" data-profile-id="' + esc(u.id) + '">' + icon("x", 14) + (pending ? " Reject" : " Revoke access") + "</button>" : "") +
      (canDel ? '<button class="btn btn-ghost btn-sm danger" data-cloud-del="' + esc(u.id) + '" title="Permanently delete account">' + icon("trash", 14) + " Delete account</button>" : "");
    const searchText = [u.full_name, u.email, u.role, u.requested_role, u.agency, brokerName].filter(Boolean).join(" ").toLowerCase();
    return '<div class="user-card cloud-user-card card card-pad" data-user-search="' + esc(searchText) + '" data-user-role="' + esc(u.role || "") + '"><div class="cloud-user-card-main">' + leadAvatar(u.full_name || u.email) +
      '<div class="grow"><div class="user-card-title-row"><div><div class="lead-card-name">' + esc(u.full_name || "Unnamed account") + '</div><div class="dim tiny user-email">' + esc(u.email || "") + '</div></div><div class="user-card-badges">' + userBadge(u.role) + '<span class="badge ' + statusClass + '">' + esc(u.registration_status) + '</span></div></div>' +
      '<div class="user-card-meta">' + reqRole + extra.join("") + '</div></div></div>' +
      '<div class="user-card-controls"><div class="field"><label>Account role</label><select class="input" data-cloud-role="' + esc(u.id) + '">' + roleOpts + '</select></div>' + brokerField + '</div>' +
      '<div class="user-card-footer"><div class="user-card-buttons">' + actions + "</div></div></div>";
  }
  function openCloudUserEditor() {
    if (!canManageUsers()) { toast("You don't have permission to manage users", "err"); return; }
    const m = $("#cu-modal");
    if (m) m.remove();
    const roleOpts = ROLES.map(r => '<option value="' + esc(r.value) + '"' + (r.value === "buyer" ? " selected" : "") + ">" + esc(r.label) + "</option>").join("");
    const brokers = remoteProfiles.filter(u => u.role === "broker" && u.registration_status === "approved");
    const brokerOpts = '<option value="">No broker</option>' + brokers.map(b => '<option value="' + esc(b.id) + '">' + esc(b.full_name || b.email) + (b.prc ? " · PRC " + esc(b.prc) : "") + "</option>").join("");
    const generatedPassword = currentUser.demo ? "" : temporaryPassword();
    const body =
      '<div class="notice-banner mt-8">' + icon("shield", 14) + ' ' + (currentUser.demo ? "Demo mode: the account is added to this sample queue (not sent to Supabase)." : "The account is created server-side as a pending registration — it appears in the Pending tab and cannot sign in until a Super Admin approves it. Give the temporary password to the new user.") + '</div>' +
      '<div class="grid grid-2">' +
      '<div class="field"><label>Full name *</label><input class="input" id="cu-name" type="text" placeholder="e.g. Marco Villanueva"></div>' +
      '<div class="field"><label>Email *</label><input class="input" id="cu-email" type="email" placeholder="user@esrealty.ph"></div>' +
      '<div class="field"><label>Role *</label><select class="input" id="cu-role">' + roleOpts + "</select></div>" +
      '<div class="field" id="cu-pass-field" style="display:none"><label>Temporary password *</label><input class="input" id="cu-pass" type="text" value="' + esc(generatedPassword) + '" readonly><div class="field-hint">Unique temporary password — give it securely to the new user; they must change it after signing in.</div></div>' +
      '<div class="field" id="cu-agency-field" style="display:none"><label>Agency / company</label><input class="input" id="cu-agency" type="text" placeholder="e.g. Villanueva & Co."></div>' +
      '<div class="field" id="cu-prc-field" style="display:none"><label>PRC license no. (brokers)</label><input class="input" id="cu-prc" type="text" placeholder="12-digit PRC license"><div class="field-hint">Required for brokers per RA 9646.</div></div>' +
      '<div class="field" id="cu-resa-field" style="display:none"><label>RESA accreditation no. (brokers)</label><input class="input" id="cu-resa" type="text" placeholder="e.g. RESA-2024-0881"></div>' +
      '<div class="field" id="cu-broker-field" style="display:none"><label>Supervising broker (agents)</label><select class="input" id="cu-broker">' + brokerOpts + '</select><div class="field-hint">Required for agents — they operate under a licensed broker.</div></div>' +
      "</div>";
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "cu-modal";
    ov.innerHTML = '<div class="modal-card modal-card-wide"><div class="modal-head"><h3>' + icon("users", 15) + ' Add Account</h3><button class="icon-btn" data-cloud-user-cancel title="Close">&times;</button></div>' +
      '<div class="modal-body" style="max-height:70vh;overflow:auto">' + body + "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-cloud-user-cancel>Cancel</button><button class="btn btn-primary" data-cloud-user-save>' + icon("check", 15) + " Create Account</button></div></div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeCloudUserModal(); });
    const syncRole = () => {
      const role = $("#cu-role").value;
      $("#cu-pass-field").style.display = currentUser.demo ? "none" : "";
      $("#cu-agency-field").style.display = (role === "broker" || role === "agent" || role === "super-admin") ? "" : "none";
      $("#cu-prc-field").style.display = role === "broker" ? "" : "none";
      $("#cu-resa-field").style.display = role === "broker" ? "" : "none";
      $("#cu-broker-field").style.display = role === "agent" ? "" : "none";
    };
    $("#cu-role").addEventListener("change", syncRole);
    syncRole();
    $("#cu-name").focus();
  }
  function closeCloudUserModal() { const m = $("#cu-modal"); if (m) m.remove(); }
  async function adminCreateAccount(payload) {
    if (!SB) throw new Error("Supabase client is not available");
    const sessionRes = await SB.auth.getSession();
    const token = sessionRes.data && sessionRes.data.session ? sessionRes.data.session.access_token : "";
    if (!token) throw new Error("Authentication required — sign in again");
    const base = String(window.ESREALTY_API_BASE || "").replace(/\/functions\/v1\/listing-api\/api$/, "");
    let response;
    try {
      response = await fetch(base + "/functions/v1/admin-create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      throw new Error("Could not reach the account service: " + friendlyErr(err.message || err));
    }
    let data = {};
    try { data = await response.json(); } catch (e) {}
    if (!response.ok) {
      if (response.status === 404 || String(data.error || "").toLowerCase().indexOf("not found") >= 0) {
        throw new Error("The account service is not deployed (admin-create-account).");
      }
      throw new Error(data.error || ("Request failed (" + response.status + ")"));
    }
    if (!data.id) throw new Error("Account was created without a user id");
    return String(data.id);
  }
  function cloudUserSaveForm() {
    if (!canManageUsers()) { toast("You don't have permission to manage users", "err"); return; }
    if (cloudAccountSaving) return;
    const $v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const name = $v("cu-name"), email = $v("cu-email"), role = $v("cu-role") || "buyer";
    if (!name) { toast("Full name is required", "err"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { toast("Enter a valid email address", "err"); return; }
    const pass = $v("cu-pass"), prc = $v("cu-prc"), resa = $v("cu-resa"), agency = $v("cu-agency"), broker = $v("cu-broker");
    if (!currentUser.demo && !pass) { toast("Temporary password is required", "err"); return; }
    if (role === "broker" && !prcValid(prc)) { toast("A valid PRC license is required for brokers", "err"); return; }
    if (role === "agent" && !broker) { toast("Agents must be linked to a supervising broker", "err"); return; }
    if (currentUser.demo) {
      closeCloudUserModal();
      remoteProfiles.unshift({ id: "demo-add-" + Date.now().toString(36), email: email, full_name: name, role: role, registration_status: "pending", requested_role: role, prc: prc || "", resa: resa || "", agency: agency || "", broker: broker || "" });
      remoteProfilesLoaded = true;
      state.usersTab = "pending";
      popupNotify("Account added — " + esc(name) + " (" + esc(roleLabel(role)) + "), pending approval");
      render();
      return;
    }
    (async () => {
      cloudAccountSaving = true;
      const saveButton = $("[data-cloud-user-save]");
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Creating..."; }
      let error = null;
      try {
        await adminCreateAccount({
          email: email, password: pass, full_name: name, role: role,
          prc: prc || null, resa: resa || null, agency: agency || null, broker: broker || null
        });
      } catch (err) {
        error = err;
      }
      cloudAccountSaving = false;
      if (error) {
        if (saveButton) { saveButton.disabled = false; saveButton.innerHTML = icon("check", 15) + " Create Account"; }
        const msg = String((error && error.message) || error || "");
        const low = msg.toLowerCase();
        if (low.indexOf("super admin access required") >= 0) {
          popupNotify("Only the Super Admin can add accounts.", "err");
          return;
        }
        if (low.indexOf("not deployed") >= 0) {
          popupNotify("Add Account is blocked because the <b>admin-create-account</b> service is not deployed. Deploy it with: <code>supabase functions deploy admin-create-account</code>, then retry.", "err");
          return;
        }
        popupNotify("Could not create account: " + esc(friendlyErr(error.message)), "err");
        return;
      }
      closeCloudUserModal();
      remoteProfilesLoaded = false;
      state.usersTab = "pending";
      popupNotify("Account created — " + esc(name) + " (" + esc(roleLabel(role)) + "), pending approval");
      loadCloudProfiles(true);
    })();
  }
  function renderUsers() {
    if (!canManageUsers()) return '<section class="users-access"><div class="hero"><div><h1>Users & Access</h1></div></div><div class="card card-pad empty">' + icon("shield", 40) + "<h3>Super Admin only</h3><p>User management is limited to the Super Admin role.</p></div></section>";
    const cloudMode = (SB && currentUser && currentUser.id) || (currentUser && currentUser.demo);
    if (cloudMode) {
      const statusCount = s => remoteProfiles.filter(u => u.registration_status === s).length;
      const pending = statusCount("pending");
      const approved = statusCount("approved");
      const rejected = statusCount("rejected");
      const tab = (["pending", "approved", "rejected", "all"].indexOf(state.usersTab) >= 0) ? state.usersTab : "pending";
      const srcBadge = currentUser.demo ? '<span class="chip">Demo data</span>' : (roleIs("super-admin") ? '<span class="chip">Live Supabase</span>' : "");
      const shown = tab === "all" ? remoteProfiles : remoteProfiles.filter(u => u.registration_status === tab);
      const tabsHtml = '<div class="tabs">' +
        '<button class="tab' + (tab === "pending" ? " active" : "") + '" data-users-tab="pending">Pending (' + pending + ")</button>" +
        '<button class="tab' + (tab === "approved" ? " active" : "") + '" data-users-tab="approved">Approved (' + approved + ")</button>" +
        '<button class="tab' + (tab === "rejected" ? " active" : "") + '" data-users-tab="rejected">Rejected (' + rejected + ")</button>" +
        '<button class="tab' + (tab === "all" ? " active" : "") + '" data-users-tab="all">All (' + remoteProfiles.length + ")</button></div>";
      const roleFilterOpts = '<option value="">All roles</option>' + ROLES.map(r => '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>').join("");
      const toolsHtml = '<div class="users-tools"><div class="users-search">' + icon("search", 15) + '<input id="users-search" type="search" placeholder="Search name, email, agency..." autocomplete="off"></div><select class="input" id="users-role-filter">' + roleFilterOpts + '</select><span class="dim tiny" id="users-visible-count">' + shown.length + ' account' + (shown.length === 1 ? "" : "s") + '</span></div>';
      let cloudHtml = '<section class="users-access"><div class="hero"><div><h1>Users &amp; Access</h1><p>Approve registrations and assign server-enforced roles. ' + srcBadge + '</p></div>' +
        '<div class="actions"><button class="btn btn-primary" data-cloud-user-new>' + icon("plus", 15) + " Add Account</button></div></div>" +
        '<div class="ls-stat-row">' + lsStat("Registrations", remoteProfiles.length) + lsStat("Pending approval", pending) + lsStat("Approved", approved) + lsStat("Rejected", rejected) + '</div>' +
        '<div class="notice-banner mt-16">' + icon("shield", 14) + ' <span>New accounts cannot access ES Realty until a Super Admin assigns a role and approves the registration.</span></div>';
      cloudHtml += '<div class="users-directory card">' + tabsHtml + toolsHtml + '</div>';
      let gridHtml;
      if (remoteProfilesError) {
        const low = String(remoteProfilesError).toLowerCase();
        const cacheHint = (low.indexOf("could not find the function") >= 0 || low.indexOf("schema cache") >= 0 || low.indexOf("column") >= 0 || low.indexOf("structure of query does not match") >= 0 || low.indexOf("return type") >= 0)
          ? '<p class="dim mt-8">This usually means a database migration has not been run yet. In the Supabase SQL Editor, run <b>supabase/fix_users_access_complete.sql</b> (whole file), then <b>notify pgrst, \'reload schema\';</b> and retry.</p>'
          : "";
        gridHtml = '<div class="card card-pad empty"><h3>Could not load registrations</h3><p class="dim">' + esc(remoteProfilesError) + '</p>' + cacheHint + '<button class="btn btn-primary mt-8" data-cloud-retry>' + icon("refresh", 14) + ' Retry</button></div>';
      } else if (!remoteProfilesLoaded) {
        gridHtml = '<div class="card card-pad empty">Loading registrations...</div>';
      } else if (shown.length) {
        gridHtml = shown.map(cloudUserCard).join("");
      } else if (tab === "pending" && remoteProfiles.length > 0) {
        gridHtml = '<div class="card card-pad empty">' + icon("check", 40) + '<h3>No pending registrations</h3><p class="dim">There are ' + remoteProfiles.length + ' account(s) on file, but none are awaiting approval. Accounts created via <b>Add Account</b> are auto-approved — check the <b>Approved</b> tab.</p>' +
          '<div class="row mt-8" style="justify-content:center;gap:8px"><button class="btn btn-ghost btn-sm" data-users-tab="approved">View Approved</button><button class="btn btn-ghost btn-sm" data-users-tab="all">View All</button></div></div>';
      } else {
        gridHtml = '<div class="card card-pad empty"><h3>No ' + (tab === "all" ? "registered accounts" : tab + " accounts") + '</h3><p class="dim">Nothing to show here yet. If you registered as <b>sample1@gmail.com</b>, sign up again or confirm it exists in this Supabase project.</p></div>';
      }
      cloudHtml += '<div class="user-grid mt-16" id="users-grid">' + gridHtml + '</div><div class="card card-pad empty mt-16" id="users-filter-empty" style="display:none"><h3>No matching accounts</h3><p class="dim">Try a different name, email, or role.</p></div>';
      const pendingResets = passwordResetRequests.filter(r => r.user_id);
      if (pendingResets.length) {
        cloudHtml += '<div class="card card-pad mt-16"><h3>' + icon("key", 15) + ' Password reset requests</h3><p class="dim">These users requested a reset from the Forgot Password tab. Generate a temporary password and share it with them.</p>' +
          '<div class="row mt-8" style="gap:8px;flex-wrap:wrap">' + pendingResets.map(r =>
            '<div class="chip-row" style="display:flex;align-items:center;gap:8px;border:1px solid var(--stroke);border-radius:10px;padding:6px 10px"><div><div class="tiny" style="font-weight:600">' + esc(r.full_name || r.email) + '</div><div class="dim tiny">' + esc(r.email) + '</div></div>' +
            '<button class="btn btn-primary btn-sm" data-reset-request="' + esc(r.user_id) + '">' + icon("key", 14) + ' Reset</button>' +
            '<button class="btn btn-ghost btn-sm" data-cancel-reset-request="' + esc(r.user_id) + '">' + icon("x", 14) + ' Cancel request</button></div>').join("") + '</div></div>';
      }
      return cloudHtml + '</section>';
    }
    const users = state.users || [];
    const brokers = brokerUsers();
    const agents = agentUsers();
    let html = '<section class="users-access"><div class="hero"><div><h1>Users &amp; Access</h1><p>Manage platform roles, PRC licenses (RA 9646), RESA accreditation, and broker&ndash;agent supervision.</p></div>' +
      '<div class="actions"><button class="btn btn-primary" data-user-new>' + icon("plus", 15) + " Add User</button></div></div>";
    html += '<div class="ls-stat-row">' +
      lsStat("Total users", users.length) + lsStat("Brokers", brokers.length) + lsStat("Agents", agents.length) +
      lsStat("Owners", users.filter(u => u.role === "owner").length) + lsStat("Buyers/Clients", users.filter(u => u.role === "buyer").length) + lsStat("Sellers/Developers", users.filter(u => u.role === "seller").length) + "</div>";
    html += '<div class="user-grid mt-16">' + (users.length ? users.map(userCard).join("") : '<div class="card card-pad empty">No users yet.</div>') + "</div>";
    html += '<div class="notice-banner mt-16">' + icon("shield", 14) + ' <span>Per RA 9646 (Real Estate Service Act), real estate <b>agents</b> must operate under a licensed <b>broker</b>. Broker PRC license numbers and RESA accreditation are shown on listings and agent profiles for DHSUD/PRC advertising compliance.</span></div>';
    return html + '</section>';
  }
  function openUserEditor(id) {
    if (!canManageUsers()) { toast("You don't have permission to manage users", "err"); return; }
    closeUserModal();
    const u = id ? (state.users || []).find(x => x.id === id) || {} : {};
    const roleOpts = ROLES.map(r => '<option value="' + r.value + '"' + (u.role === r.value ? " selected" : "") + ">" + esc(r.label) + "</option>").join("");
    const brokerOpts = '<option value="">No broker</option>' + brokerUsers().filter(b => b.id !== id).map(b => '<option value="' + esc(b.id) + '"' + (u.broker === b.id ? " selected" : "") + ">" + esc(b.name) + (b.prc ? " · PRC " + esc(b.prc) : "") + "</option>").join("");
    const body =
      '<div class="grid grid-2">' +
      '<div class="field"><label>Full name *</label><input class="input" id="us-name" type="text" value="' + esc(u.name || "") + '" placeholder="e.g. Marco Villanueva"></div>' +
      '<div class="field"><label>Email *</label><input class="input" id="us-email" type="email" value="' + esc(u.email || "") + '" placeholder="user@esrealty.ph"></div>' +
      '<div class="field"><label>Role</label><select class="input" id="us-role">' + roleOpts + "</select></div>" +
      '<div class="field"><label>Agency / company</label><input class="input" id="us-agency" type="text" value="' + esc(u.agency || "") + '" placeholder="e.g. Villanueva & Co."></div>' +
      '<div class="field"><label>PRC license no. (brokers)</label><input class="input" id="us-prc" type="text" value="' + esc(u.prc || "") + '" placeholder="12-digit PRC license"><div class="field-hint">Required for brokers per RA 9646. Format: 12-digit PRC number.</div></div>' +
      '<div class="field"><label>RESA accreditation no.</label><input class="input" id="us-resa" type="text" value="' + esc(u.resa || "") + '" placeholder="e.g. RESA-2024-0881"></div>' +
      '<div class="field"><label>Supervising broker (agents)</label><select class="input" id="us-broker">' + brokerOpts + "</select></div>" +
      '<div class="field"><label>Status</label><label class="ms-chk"><input type="checkbox" id="us-active"' + (u.active !== false ? " checked" : "") + "> Account active</label></div>" +
      "</div>" +
      (id && u.role === "broker" && !prcValid(u.prc) ? '<div class="notice-banner err mt-8">' + icon("shield", 14) + " This broker has no valid PRC license on file — required for compliance.</div>" : "") +
      '<div class="notice-banner mt-8">' + icon("shield", 14) + " Demo note: data is stored locally in your browser. PRC numbers are self-entered; PH has no public verification API.</div>";
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "us-modal";
    ov.setAttribute("data-edit-id", id || "");
    ov.innerHTML = '<div class="modal-card modal-card-wide"><div class="modal-head"><h3>' + (id ? "Edit User" : "Add User") + '</h3><button class="icon-btn" data-user-cancel title="Close">&times;</button></div>' +
      '<div class="modal-body" style="max-height:70vh;overflow:auto">' + body + "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-user-cancel>Cancel</button><button class="btn btn-primary" data-user-save>' + icon("check", 15) + " Save User</button></div></div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeUserModal(); });
  }
  function closeUserModal() { const m = $("#us-modal"); if (m) m.remove(); }
  function userSaveForm() {
    const $v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const name = $v("us-name"), email = $v("us-email");
    if (!name || !email) { toast("Name and email are required", "err"); return; }
    const role = $v("us-role") || "buyer", prc = $v("us-prc"), broker = $v("us-broker");
    if (role === "broker" && !prcValid(prc)) { toast("A valid 6–7 digit or 12-digit PRC license is required for brokers", "err"); return; }
    if (role === "agent" && !broker) { toast("Agents must be linked to a supervising broker", "err"); return; }
    const m = $("#us-modal");
    const editId = m ? (m.getAttribute("data-edit-id") || "") : "";
    const rec = editId ? ((state.users || []).find(x => x.id === editId) || {}) : {};
    rec.id = rec.id || ("u-" + Date.now().toString(36));
    rec.name = name; rec.email = email;
    rec.role = role;
    rec.agency = $v("us-agency");
    rec.prc = prc;
    rec.prcVerified = rec.prc ? prcValid(rec.prc) : false;
    rec.resa = $v("us-resa");
    rec.broker = broker;
    rec.active = $("#us-active") ? $("#us-active").checked : true;
    rec.updatedAt = new Date().toISOString();
    if (!rec.createdAt) rec.createdAt = rec.updatedAt;
    if (!state.users) state.users = [];
    const idx = state.users.findIndex(x => x.id === rec.id);
    if (idx >= 0) state.users[idx] = rec; else state.users.push(rec);
    closeUserModal();
    save(); render();
    toast(editId ? "User updated" : "User added");
  }
  function userDeleteForm(id) {
    if (!canManageUsers()) { toast("You don't have permission to manage users", "err"); return; }
    const u = (state.users || []).find(x => x.id === id);
    if (!u) { toast("User not found", "err"); return; }
    const me = currentUser ? String(currentUser.email || "").toLowerCase() : "";
    if (me && String(u.email || "").toLowerCase() === me) { toast("You can't delete your own account", "err"); return; }
    const linkedOwner = u.pmsOwnerId ? (pms().owners || []).find(o => o.id === u.pmsOwnerId) : null;
    if (linkedOwner && !allowPmsOwnerDeletion(linkedOwner)) return;
    const linked = u.pmsOwnerId || u.pmsTenantId;
    const note = u.pmsOwnerId ? " The linked Property Management owner will also be deleted." : (linked ? " This user is linked to a PMS record." : "");
    if (!confirm("Delete " + (u.name || u.email) + "? Their login and access will be removed." + note)) return;
    state.users = (state.users || []).filter(x => x.id !== id);
    let auth = [];
    try { auth = JSON.parse(localStorage.getItem("esrealty_users") || "[]"); } catch (e) {}
    const em = String(u.email || "").toLowerCase();
    auth = auth.filter(x => String(x.email || "").toLowerCase() !== em);
    localStorage.setItem("esrealty_users", JSON.stringify(auth));
    if (u.pmsOwnerId) {
      const owner = (pms().owners || []).find(o => o.id === u.pmsOwnerId);
      if (owner) { owner.archived = true; owner.accountStatus = "deleted"; owner.updatedAt = Date.now(); }
    }
    save(); render();
    toast("User deleted");
  }
  let usersHooked = false;
  function demoCloudProfiles() {
    if (remoteProfilesLoaded && remoteProfiles.length) return remoteProfiles;
    return [
      { id: "demo-pending-1", email: "juan@esrealty.ph", full_name: "Juan Dela Cruz", role: "buyer", registration_status: "pending", requested_role: "agent" },
      { id: "demo-pending-2", email: "maria@esrealty.ph", full_name: "Maria Santos", role: "buyer", registration_status: "pending", requested_role: "broker" },
      { id: "demo-pending-3", email: "carlos@esrealty.ph", full_name: "Carlos Reyes", role: "buyer", registration_status: "pending", requested_role: "owner" },
      { id: "demo-approved-1", email: "ana@esrealty.ph", full_name: "Ana Lopez", role: "agent", registration_status: "approved", requested_role: "agent", broker: "demo-approved-2", agency: "Villanueva & Co." },
      { id: "demo-approved-2", email: "broker@esrealty.ph", full_name: "Marco Villanueva", role: "broker", registration_status: "approved", requested_role: "broker", prc: "0012345", resa: "RESA-2024-0881", agency: "Villanueva & Co." },
      { id: "demo-rejected-1", email: "pedro@esrealty.ph", full_name: "Pedro Garcia", role: "buyer", registration_status: "rejected", requested_role: "tenant" }
    ];
  }
  async function loadCloudProfiles(forceRetry) {
    if (!currentUser || !canManageUsers() || remoteProfilesLoading) return;
    if (!currentUser.demo && !(SB && currentUser.id)) return;
    if (remoteProfilesFailed && !forceRetry) return;
    remoteProfilesLoading = true;
    remoteProfilesError = "";
    try {
      if (currentUser.demo) {
        remoteProfiles = demoCloudProfiles();
        remoteProfilesFailed = false;
      } else {
        const res = await SB.rpc("admin_list_profiles");
        if (res.error) throw res.error;
        remoteProfiles = Array.isArray(res.data) ? res.data : [];
        remoteProfilesFailed = false;
      }
    } catch (err) {
      remoteProfilesLoading = false;
      remoteProfilesFailed = true;
      remoteProfilesError = friendlyErr(String((err && err.message) || err || "Unknown error"));
      if (state.view === "users") render();
      return;
    }
    remoteProfilesLoaded = true;
    (pms().owners || []).forEach(owner => {
      if (!owner.authUserId || owner.archived === true) return;
      const profile = remoteProfiles.find(p => String(p.id) === String(owner.authUserId));
      if (profile) owner.accountStatus = profile.registration_status;
    });
    syncPmsOwnersFromProfiles();
    syncPmsTenantsFromProfiles();
    if (state.view === "users" || state.view === "pms") render();
    remoteProfilesLoading = false;
  }
  async function setCloudProfileAccess(id, status) {
    const role = $('[data-cloud-role="' + id + '"]');
    if (currentUser.demo) {
      const p = remoteProfiles.find(x => x.id === id);
      if (p) { p.role = role ? role.value : "buyer"; p.registration_status = status; }
      const owner = (pms().owners || []).find(o => String(o.authUserId || "") === String(id));
      if (owner) { owner.accountStatus = status; owner.updatedAt = Date.now(); save(); }
      const tenant = (pms().tenants || []).find(t => String(t.authUserId || "") === String(id));
      if (tenant) { tenant.accountStatus = status; tenant.updatedAt = Date.now(); save(); }
      toast(status === "approved" ? "Registration approved" : "Registration rejected");
      render();
      return;
    }
    const { error } = await SB.rpc("admin_set_profile_access", { target_id: id, next_role: role ? role.value : "buyer", next_status: status });
    if (error) { toast("Registration update failed: " + esc(friendlyErr(error.message)), "err"); return; }
    remoteProfilesLoaded = false;
    const owner = (pms().owners || []).find(o => String(o.authUserId || "") === String(id));
    if (owner) { owner.accountStatus = status; owner.updatedAt = Date.now(); save(); }
    const tenant = (pms().tenants || []).find(t => String(t.authUserId || "") === String(id));
    if (tenant) { tenant.accountStatus = status; tenant.updatedAt = Date.now(); save(); }
    toast(status === "approved" ? "Registration approved" : "Registration rejected");
    loadCloudProfiles(true);
  }
  async function setCloudBroker(id, brokerId) {
    if (!canManageUsers()) { toast("You don't have permission to manage users", "err"); return; }
    const p = remoteProfiles.find(x => x.id === id);
    if (!p) return;
    if (currentUser.demo) {
      p.broker = brokerId || "";
      toast(brokerId ? "Supervising broker assigned" : "Supervising broker removed");
      render();
      return;
    }
    const { error } = await SB.rpc("admin_assign_broker", { target_id: id, broker_id: brokerId || null });
    if (error) {
      const low = String((error && error.message) || error || "").toLowerCase();
      if (low.indexOf("could not find the function") >= 0 || low.indexOf("schema cache") >= 0 || (low.indexOf("function") >= 0 && low.indexOf("admin_assign_broker") >= 0)) {
        popupNotify("Assigning a supervising broker is blocked by a missing database function. In the Supabase SQL Editor run <b>patch_admin_create_account.sql</b> (now re-runnable — it adds the <b>admin_assign_broker</b> function and reloads the schema cache), then retry.", "err");
      } else {
        toast("Could not assign broker: " + esc(friendlyErr(error.message)), "err");
      }
      loadCloudProfiles(true);
      return;
    }
    toast(brokerId ? "Supervising broker assigned" : "Supervising broker removed");
    loadCloudProfiles(true);
  }
  async function loadPasswordResets(force) {
    if (!SB || !currentUser || !currentUser.id || currentUser.demo) return;
    if (!force && passwordResetsLoaded) return;
    passwordResetsLoaded = true;
    try {
      const res = await SB.rpc("admin_list_password_resets");
      if (res.error) throw res.error;
      passwordResetRequests = Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      passwordResetRequests = [];
    }
    if (state.view === "users") render();
  }
  function randomTempPassword(len) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < (len || 12); i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
  function showTempPasswordModal(name, temp) {
    const existing = $("#rp-modal");
    if (existing) existing.remove();
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "rp-modal";
    ov.innerHTML = '<div class="modal-card" style="max-width:420px"><div class="modal-head"><h3>' + icon("key", 15) + ' Password Reset</h3><button class="icon-btn" data-rp-close title="Close">&times;</button></div>' +
      '<div class="modal-body"><p class="dim">Temporary password generated for <b>' + esc(name) + '</b>. Share it with the user - it replaces their current password.</p>' +
      '<div class="row mt-8" style="gap:8px"><input class="input" id="rp-pass" type="text" readonly value="' + esc(temp) + '" style="font-family:monospace;letter-spacing:1px">' +
      '<button class="btn btn-primary" data-rp-copy>' + icon("copy", 15) + ' Copy</button></div></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" data-rp-close>Done</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeRpModal(); });
    ov.addEventListener("click", e => {
      if (e.target.closest("[data-rp-copy]")) {
        const inp = $("#rp-pass");
        if (inp) { inp.select(); try { document.execCommand("copy"); } catch (err) {} }
        toast("Temporary password copied");
      }
    });
    ov.addEventListener("click", e => { if (e.target.closest("[data-rp-close]")) closeRpModal(); });
  }
  function closeRpModal() { const m = $("#rp-modal"); if (m) m.remove(); }
  async function resetCloudPassword(id) {
    if (!canManageUsers()) { toast("You don't have permission to manage users", "err"); return; }
    const p = remoteProfiles.find(x => x.id === id);
    const name = p ? (p.full_name || p.email) : id;
    if (!confirm("Reset the password for " + name + "? A new temporary password will be generated — give it to the user in person.")) return;
    if (currentUser.demo) {
      const temp = randomTempPassword();
      showTempPasswordModal(name, temp);
      demoResetRequests = demoResetRequests.filter(r => r.user_id !== id);
      passwordResetRequests = [];
      toast("Temporary password generated");
      render();
      return;
    }
    const btn = $('[data-cloud-reset-pass="' + id + '"]');
    if (btn) { btn.disabled = true; btn.textContent = "Generating…"; }
    try {
      const res = await SB.rpc("admin_reset_password", { target_id: id });
      if (res.error) throw res.error;
      showTempPasswordModal(name, String(res.data || ""));
      toast("Password reset successfully");
    } catch (err) {
      toast("Could not reset password: " + esc(friendlyErr(err.message || err)), "err");
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = icon("key", 14) + " Reset"; }
      loadPasswordResets(true);
    }
  }
  async function cancelResetRequest(id) {
    if (!canManageUsers()) { toast("You don't have permission to manage users", "err"); return; }
    const r = passwordResetRequests.find(x => String(x.user_id) === String(id));
    const name = r ? (r.full_name || r.email) : id;
    if (!confirm("Cancel the password reset request for " + name + "? The user will not receive a new temporary password.")) return;
    if (currentUser.demo) {
      passwordResetRequests = passwordResetRequests.filter(x => String(x.user_id) !== String(id));
      toast("Reset request cancelled");
      render();
      return;
    }
    const btn = $('[data-cancel-reset-request="' + id + '"]');
    if (btn) { btn.disabled = true; btn.textContent = "Cancelling…"; }
    try {
      const res = await SB.rpc("admin_cancel_password_reset", { target_id: id });
      if (res.error) throw res.error;
      toast("Reset request cancelled");
    } catch (err) {
      const low = String(err && err.message || "").toLowerCase();
      if (low.indexOf("could not find the function") >= 0 || low.indexOf("schema cache") >= 0 || low.indexOf("not found") >= 0 && low.indexOf("admin_cancel_password_reset") >= 0) {
        popupNotify("Cancelling a reset request is blocked by a missing database function. In the Supabase SQL Editor run <b>admin_cancel_password_reset.sql</b> (this single file adds the <b>admin_cancel_password_reset</b> function and reloads the schema cache), then press Retry.", "err");
      } else {
        toast("Could not cancel request: " + esc(friendlyErr(err.message || err)), "err");
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = icon("x", 14) + " Cancel request"; }
      loadPasswordResets(true);
    }
  }
  async function deleteCloudAccount(id) {
    if (!canManageUsers()) { toast("You don't have permission to manage users", "err"); return; }
    if (currentUser && currentUser.id && id === currentUser.id) { toast("You can't delete your own account", "err"); return; }
    const p = remoteProfiles.find(x => x.id === id);
    const name = p ? (p.full_name || p.email || id) : id;
    const linkedOwner = (pms().owners || []).find(o => o.archived !== true && String(o.authUserId || "") === String(id));
    if (linkedOwner && !allowPmsOwnerDeletion(linkedOwner)) return;
    const linkedTenant = (pms().tenants || []).find(t => t.archived !== true && String(t.authUserId || "") === String(id));
    if (linkedTenant && !allowPmsTenantDeletion(linkedTenant)) return;
    if (p && p.registration_status !== "rejected") { toast("Only rejected accounts can be deleted", "err"); return; }
    if (!confirm("Delete the account for " + name + "? This permanently removes the user, their profile, and their access. This cannot be undone.")) return;
    if (currentUser.demo) {
      remoteProfiles = remoteProfiles.filter(x => x.id !== id);
      removeLinkedPmsOwner(id);
      removeLinkedPmsTenant(id);
      save();
      toast("Account deleted");
      render();
      return;
    }
    const btn = $('[data-cloud-del="' + id + '"]');
    if (btn) { btn.disabled = true; }
    try {
      const res = await SB.rpc("admin_delete_account", { target_id: id });
      if (res.error) throw res.error;
      remoteProfiles = remoteProfiles.filter(x => x.id !== id);
      removeLinkedPmsOwner(id);
      removeLinkedPmsTenant(id);
      save();
      toast("Account deleted");
      render();
    } catch (err) {
      const low = String(err && err.message || "").toLowerCase();
      if (low.indexOf("could not find the function") >= 0 || low.indexOf("schema cache") >= 0 || low.indexOf("not found") >= 0 && low.indexOf("admin_delete_account") >= 0) {
        popupNotify("Delete account is blocked by a missing database function. In the Supabase SQL Editor run <b>admin_delete_account.sql</b> (this single file adds just the <b>admin_delete_account</b> function and reloads the schema cache), then press Retry.", "err");
      } else {
        toast("Could not delete account: " + esc(friendlyErr(err.message || err)), "err");
      }
    } finally {
      if (btn) { btn.disabled = false; }
    }
  }
  function applyUsersFilters() {
    const search = String(($("#users-search") || {}).value || "").trim().toLowerCase();
    const role = String(($("#users-role-filter") || {}).value || "");
    const cards = $$("#users-grid .cloud-user-card");
    let visible = 0;
    cards.forEach(card => {
      const show = (!search || String(card.getAttribute("data-user-search") || "").indexOf(search) >= 0) && (!role || card.getAttribute("data-user-role") === role);
      card.style.display = show ? "" : "none";
      if (show) visible++;
    });
    const count = $("#users-visible-count");
    if (count) count.textContent = visible + " account" + (visible === 1 ? "" : "s");
    const empty = $("#users-filter-empty");
    if (empty) empty.style.display = cards.length && !visible ? "" : "none";
  }
  function bindUsers() {
    if ((SB && currentUser && currentUser.id) || (currentUser && currentUser.demo)) loadCloudProfiles();
    if (SB && currentUser && currentUser.id && !currentUser.demo) loadPasswordResets();
    if (!usersHooked) {
      usersHooked = true;
      document.addEventListener("click", e => {
        const nw = e.target.closest("[data-user-new]");
        if (nw) { openUserEditor(); return; }
        const ed = e.target.closest("[data-user-edit]");
        if (ed) { openUserEditor(ed.getAttribute("data-user-edit")); return; }
        const sv = e.target.closest("[data-user-save]");
        if (sv) { userSaveForm(); return; }
        const cc = e.target.closest("[data-user-cancel]");
        if (cc) { closeUserModal(); return; }
        const dl = e.target.closest("[data-user-del]");
        if (dl) { userDeleteForm(dl.getAttribute("data-user-del")); return; }
        const access = e.target.closest("[data-profile-action]");
        if (access) { setCloudProfileAccess(access.getAttribute("data-profile-id"), access.getAttribute("data-profile-action")); return; }
        const utab = e.target.closest("[data-users-tab]");
        if (utab) { state.usersTab = utab.getAttribute("data-users-tab"); save(); render(); return; }
        const cun = e.target.closest("[data-cloud-user-new]");
        if (cun) { openCloudUserEditor(); return; }
        const cus = e.target.closest("[data-cloud-user-save]");
        if (cus) { cloudUserSaveForm(); return; }
        const cuc = e.target.closest("[data-cloud-user-cancel]");
        if (cuc) { closeCloudUserModal(); return; }
        const crt = e.target.closest("[data-cloud-retry]");
        if (crt) { remoteProfilesFailed = false; loadCloudProfiles(true); return; }
        const rp = e.target.closest("[data-cloud-reset-pass]");
        if (rp) { resetCloudPassword(rp.getAttribute("data-cloud-reset-pass")); return; }
        const cdl = e.target.closest("[data-cloud-del]");
        if (cdl) { deleteCloudAccount(cdl.getAttribute("data-cloud-del")); return; }
        const rpr = e.target.closest("[data-reset-request]");
        if (rpr) { resetCloudPassword(rpr.getAttribute("data-reset-request")); return; }
        const crr = e.target.closest("[data-cancel-reset-request]");
        if (crr) { cancelResetRequest(crr.getAttribute("data-cancel-reset-request")); return; }
      });
      document.addEventListener("change", e => {
        const cr = e.target.closest("[data-cloud-role]");
        if (cr) {
          const holder = cr.closest(".user-card");
          const field = holder && holder.querySelector("[data-cloud-broker]");
          if (field) field.closest(".cloud-broker-field").style.display = cr.value === "agent" ? "" : "none";
          return;
        }
        const cb = e.target.closest("[data-cloud-broker]");
        if (cb) { setCloudBroker(cb.getAttribute("data-cloud-broker"), cb.value); return; }
      });
    }
    const userSearch = $("#users-search");
    if (userSearch) userSearch.addEventListener("input", applyUsersFilters);
    const roleFilter = $("#users-role-filter");
    if (roleFilter) roleFilter.addEventListener("change", applyUsersFilters);
  }

  /* ================= DOCUMENT VAULT ================= */
  const VAULT_CATEGORIES = ["Valid ID", "TIN", "Proof of Billing", "Proof of Income", "SPA", "Bank / Financing", "Contract", "Title / Deed", "Other"];
  const TX_VAULT_CATEGORIES = ["Reservation Agreement", "Contract to Sell", "Deed of Absolute Sale", "TCT / CCT", "Tax Declaration", "BIR CAR / eCAR", "Transfer Tax Receipt", "Registry of Deeds Receipt", "Proof of Payment", "Valid ID", "TIN", "SPA", "Bank / Financing", "Other"];
  const VAULT_BUCKET = "private-documents";
  function vaultSafeName(name) { return String(name || "file").replace(/[^A-Za-z0-9._ -]+/g, "_").replace(/ +/g, "_").slice(-80); }
  async function vaultSignedUrl(doc, forDownload) {
    if (doc.storagePath && SB) {
      const res = await SB.storage.from(VAULT_BUCKET).createSignedUrl(doc.storagePath, 60, forDownload ? { download: doc.name || true } : undefined);
      if (res.error || !res.data || !res.data.signedUrl) throw new Error(res.error ? res.error.message : "Cloud link unavailable");
      return res.data.signedUrl;
    }
    if (doc.dataUrl) return doc.dataUrl;
    throw new Error("Document data is unavailable");
  }
  async function migrateVaultToCloud() {
    try {
      if (!SB || !currentUser || !currentUser.id || currentUser.demo) return;
      const docs = (state.docVault || []).slice();
      (state.transactions || []).forEach(tx => (tx.documents || []).forEach(d => docs.push(d)));
      const pending = docs.filter(d => d.dataUrl && !d.storagePath).slice(0, 25);
      if (!pending.length) return;
      let ok = 0;
      for (const d of pending) {
        try {
          const blob = await (await fetch(d.dataUrl)).blob();
          const vpath = currentUser.id + "/vault/" + d.id + "__" + vaultSafeName(d.name);
          const up = await SB.storage.from(VAULT_BUCKET).upload(vpath, blob, { contentType: blob.type || "application/octet-stream", upsert: true });
          if (up.error) throw up.error;
          d.storagePath = vpath;
          delete d.dataUrl;
          ok++;
        } catch (e2) {}
      }
      if (ok > 0) { save(); toast("Moved " + ok + " document" + (ok === 1 ? "" : "s") + " to cloud storage"); render(); }
    } catch (e) {}
  }
  function vaultDocs(ownerType, ownerId) {
    const local = (state.docVault || []).filter(d => d.ownerType === ownerType && d.ownerId === ownerId);
    if (ownerType !== "tx") return local;
    const t = (state.transactions || []).find(x => x.id === ownerId);
    const shared = t && Array.isArray(t.documents) ? t.documents : [];
    return shared.concat(local).filter((d, i, arr) => arr.findIndex(x => x.id === d.id) === i);
  }
  function vaultCategories(ownerType) { return ownerType === "tx" ? TX_VAULT_CATEGORIES : VAULT_CATEGORIES; }
  function vaultDocById(id) {
    return (state.docVault || []).find(d => d.id === id) || (state.transactions || []).reduce((found, t) => found || (t.documents || []).find(d => d.id === id), null);
  }
  function vaultListHTML(ownerType, ownerId) {
    const docs = vaultDocs(ownerType, ownerId).slice().sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
    return docs.length ? docs.map(vaultDocRow).join("") : '<div class="vault-empty">' + icon("folder", 28) + '<b>No documents uploaded</b><span>Choose a category and add the first file.</span></div>';
  }
  function openVault(ownerType, ownerId, title) {
    closeVault();
    const docs = vaultDocs(ownerType, ownerId);
    const catOpts = vaultCategories(ownerType).map(c => '<option value="' + esc(c) + '">' + esc(c) + "</option>").join("");
    const maxLabel = currentUser && currentUser.demo ? "900 KB" : "4 MB";
    const body =
      '<div class="notice-banner">' + icon("shield", 14) + ' <span>Handle personal and transaction records according to the Data Privacy Act of 2012 (RA 10173). Upload only files required for this transaction.</span></div>' +
      '<div class="vault-upload"><label class="vault-drop" for="vl-file">' + icon("upload", 22) + '<span><b id="vl-file-name">Choose a document</b><small>PDF, JPG, PNG, DOC or DOCX · maximum ' + maxLabel + '</small></span><input type="file" id="vl-file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"></label>' +
      '<div class="vault-upload-controls"><div class="field"><label>Document category</label><select class="input" id="vl-cat">' + catOpts + '</select></div><button class="btn btn-primary" data-vault-save>' + icon("upload", 15) + ' Upload Document</button></div></div>' +
      '<div class="vault-list-head"><div><h3>Uploaded documents</h3><span class="dim tiny" id="vl-count">' + docs.length + ' file' + (docs.length === 1 ? "" : "s") + '</span></div></div><div id="vl-docs" class="vault-list">' + vaultListHTML(ownerType, ownerId) + "</div>";
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "vl-modal";
    ov.innerHTML = '<div class="modal-card modal-card-wide"><div class="modal-head"><h3>' + icon("folder", 15) + " " + esc(title || "Document Vault") + '</h3><button class="icon-btn" data-vault-cancel title="Close">&times;</button></div>' +
      '<div class="modal-body vault-modal-body">' + body + "</div>" +
      '<div class="modal-foot"><span class="dim tiny grow">Documents are attached to this record.</span><button class="btn btn-ghost" data-vault-cancel>Close</button></div></div>';
    document.body.appendChild(ov);
    ov.setAttribute("data-owner-type", ownerType);
    ov.setAttribute("data-owner-id", ownerId);
    ov.addEventListener("click", e => { if (e.target === ov) closeVault(); });
  }
  function closeVault() { const m = $("#vl-modal"); if (m) m.remove(); }
  function vaultDocRow(d, readOnly) {
    const ext = String(d.name || "file").split(".").pop().slice(0, 5).toUpperCase();
    return '<div class="vault-row"><div class="vault-ic"><span>' + esc(ext) + '</span></div><div class="grow"><div class="vault-name">' + esc(d.name) + '</div><div class="vault-meta"><span class="badge blue">' + esc(d.category || "Other") + '</span><span>' + esc(d.size || "") + '</span><span>' + esc(new Date(d.uploadedAt).toLocaleDateString()) + '</span></div></div><div class="vault-actions">' +
      '<button class="icon-btn btn-sm" data-vault-open="' + esc(d.id) + '" title="Open document">' + icon("file", 14) + '</button><button class="icon-btn btn-sm" data-vault-download="' + esc(d.id) + '" title="Download">' + icon("download", 14) + '</button>' + (!readOnly ? '<button class="icon-btn btn-sm danger" data-vault-del="' + esc(d.id) + '" title="Remove">' + icon("trash", 14) + '</button>' : "") + "</div></div>";
  }
  function vaultFileSelected(input) {
    const label = $("#vl-file-name");
    if (label) label.textContent = input && input.files && input.files[0] ? input.files[0].name : "Choose a document";
    const drop = input && input.closest(".vault-drop");
    if (drop) drop.classList.toggle("has-file", !!(input.files && input.files.length));
  }
  function vaultRefresh(ownerType, ownerId) {
    const docsEl = $("#vl-docs");
    if (docsEl) docsEl.innerHTML = vaultListHTML(ownerType, ownerId);
    const docs = vaultDocs(ownerType, ownerId);
    const count = $("#vl-count");
    if (count) count.textContent = docs.length + " file" + (docs.length === 1 ? "" : "s");
  }
  function vaultSaveDoc() {
    const catEl = $("#vl-cat");
    const fileEl = $("#vl-file");
    const ov = $("#vl-modal");
    if (!fileEl || !fileEl.files || !fileEl.files.length) { toast("Choose a file first", "err"); return; }
    const file = fileEl.files[0];
    const allowed = /\.(pdf|jpe?g|png|docx?)$/i.test(file.name || "");
    if (!allowed) { toast("Use a PDF, JPG, PNG, DOC or DOCX file", "err"); return; }
    const maxBytes = currentUser && currentUser.demo ? 900000 : 4000000;
    if (file.size > maxBytes) { toast("File is too large (maximum " + (maxBytes < 1000000 ? "900 KB" : "4 MB") + ")", "err"); return; }
    const saveButton = $("[data-vault-save]");
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Uploading..."; }
    const finishUpload = (rec) => {
      if (rec.ownerType === "tx") {
        const tx = (state.transactions || []).find(x => x.id === rec.ownerId);
        if (tx) { tx.documents = tx.documents || []; tx.documents.push(rec); tx.updatedAt = new Date().toISOString(); persistTransactionToCloud(tx); }
      } else {
        if (!state.docVault) state.docVault = [];
        state.docVault.push(rec);
      }
      save(); render(); vaultRefresh(rec.ownerType, rec.ownerId);
      fileEl.value = ""; vaultFileSelected(fileEl);
      if (saveButton) { saveButton.disabled = false; saveButton.innerHTML = icon("upload", 15) + " Upload Document"; }
      toast("Document uploaded" + (rec.storagePath ? " (cloud)" : " (this browser)"));
    };
    const failUpload = (msg) => {
      if (saveButton) { saveButton.disabled = false; saveButton.innerHTML = icon("upload", 15) + " Upload Document"; }
      toast(msg, "err");
    };
    (async () => {
      try {
        const baseRec = { id: "doc-" + Date.now() + "-" + Math.floor(Math.random() * 999), name: file.name, category: catEl ? catEl.value : "Other", size: (file.size / 1024).toFixed(0) + " KB", ownerType: ov ? ov.getAttribute("data-owner-type") : "", ownerId: ov ? ov.getAttribute("data-owner-id") : "", uploadedAt: new Date().toISOString() };
        if (SB && currentUser && currentUser.id && !currentUser.demo) {
          const vpath = currentUser.id + "/vault/" + baseRec.id + "__" + vaultSafeName(file.name);
          const up = await SB.storage.from(VAULT_BUCKET).upload(vpath, file, { contentType: file.type || "application/octet-stream" });
          if (up.error) throw new Error(up.error.message || "Upload failed");
          baseRec.storagePath = vpath;
          finishUpload(baseRec);
        } else {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Could not read the selected file"));
            reader.readAsDataURL(file);
          });
          baseRec.dataUrl = dataUrl;
          finishUpload(baseRec);
        }
      } catch (error) {
        failUpload(friendlyErr(error.message));
      }
    })();
  }
  async function vaultDelete(id) {
    const doc = (state.docVault || []).find(d => d.id === id);
    const sharedTx = (state.transactions || []).find(t => (t.documents || []).some(d => d.id === id));
    const target = doc || (sharedTx && (sharedTx.documents || []).find(d => d.id === id));
    if (!target || !confirm('Remove "' + (target.name || "document") + '" from this record?')) return;
    if (target.storagePath && SB) { try { await SB.storage.from(VAULT_BUCKET).remove([target.storagePath]); } catch (cloudErr) {} }
    state.docVault = (state.docVault || []).filter(d => d.id !== id);
    if (sharedTx) { sharedTx.documents = (sharedTx.documents || []).filter(d => d.id !== id); sharedTx.updatedAt = new Date().toISOString(); persistTransactionToCloud(sharedTx); }
    save(); render();
    const ov = $("#vl-modal");
    if (ov) vaultRefresh(ov.getAttribute("data-owner-type"), ov.getAttribute("data-owner-id"));
    toast("Document removed", "err");
  }
  async function vaultOpenDoc(id) {
    const doc = vaultDocById(id);
    let src;
    try { src = await vaultSignedUrl(doc, false); } catch (e) { toast(friendlyErr(e.message), "err"); return; }
    const win = window.open(src, "_blank", "noopener");    if (!win) toast("Your browser blocked the document preview. Use Download instead.", "err");
  }
  async function vaultDownloadDoc(id) {
    const doc = vaultDocById(id);
    let src;
    try { src = await vaultSignedUrl(doc, true); } catch (e) { toast(friendlyErr(e.message), "err"); return; }
    const a = document.createElement("a");
    a.href = src;
    a.download = doc.name || "document"; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ================= SITE VISIT SCHEDULER ================= */
  function visitsFor(leadId) { return (state.siteVisits || []).filter(v => v.leadId === leadId).sort((a, b) => String(a.date).localeCompare(String(b.date))); }
  function visitBadge(status) { const m = { scheduled: ["Scheduled", "blue"], done: ["Completed", "green"], cancelled: ["Cancelled", "red"] }; const c = m[status] || ["Scheduled", "blue"]; return '<span class="badge ' + c[1] + '">' + c[0] + "</span>"; }
  function openVisitScheduler(leadId) {
    closeVisitModal();
    const l = (state.leads || []).find(x => x.id === leadId);
    if (!leadCanEdit(l)) { toast("You can only edit leads you created", "err"); return; }
    const body =
      '<div class="grid grid-2">' +
      '<div class="field"><label>Date *</label><input class="input" id="vs-date" type="date"></div>' +
      '<div class="field"><label>Time *</label><input class="input" id="vs-time" type="time"></div>' +
      '<div class="field" style="grid-column:span 2"><label>Location / property</label><input class="input" id="vs-loc" type="text" placeholder="e.g. Model unit, One Orchard Makati"></div>' +
      '<div class="field" style="grid-column:span 2"><label>Reminder (when to nudge via SMS/Viber/email)</label><select class="input" id="vs-remind"><option value="1">1 hour before</option><option value="3" selected>3 hours before</option><option value="24">1 day before</option><option value="0">No reminder</option></select></div>' +
      '<div class="field" style="grid-column:span 2"><label>Notes</label><textarea class="input" id="vs-notes" rows="2" placeholder="Bring valid ID, meet at the lobby…"></textarea></div>' +
      "</div>" +
      '<div class="notice-banner mt-8">' + icon("phone", 14) + " Many PH clients prefer SMS / Viber reminders — we list the reminder in the dashboard so you can send it via your messaging app.</div>";
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "vs-modal";
    ov.setAttribute("data-lead-id", leadId);
    ov.innerHTML = '<div class="modal-card"><div class="modal-head"><h3>' + icon("calendar", 15) + ' Schedule Site Viewing</h3><button class="icon-btn" data-visit-cancel title="Close">&times;</button></div>' +
      '<div class="modal-body">' + body + "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-visit-cancel>Cancel</button><button class="btn btn-primary" data-visit-save>' + icon("check", 15) + ' Schedule</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeVisitModal(); });
    const dt = $("#vs-date");
    if (dt) { const nd = new Date(Date.now() + 2 * 86400000); dt.value = nd.toISOString().slice(0, 10); }
    const tm = $("#vs-time");
    if (tm) tm.value = "10:00";
  }
  function closeVisitModal() { const m = $("#vs-modal"); if (m) m.remove(); }
  function visitSaveForm() {
    const ov = $("#vs-modal");
    const $v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const date = $v("vs-date"), time = $v("vs-time");
    if (!date || !time) { toast("Date and time are required", "err"); return; }
    const rec = { id: "visit-" + Date.now(), leadId: ov ? ov.getAttribute("data-lead-id") : "", date: date, time: time, location: $v("vs-loc"), remind: $v("vs-remind"), notes: $v("vs-notes"), status: "scheduled", createdAt: new Date().toISOString() };
    if (!state.siteVisits) state.siteVisits = [];
    state.siteVisits.push(rec);
    const l = (state.leads || []).find(x => x.id === rec.leadId);
    if (l) {
      if (l.status === "new") l.status = "contacted";
      l.calendarEvents = l.calendarEvents || [];
      l.calendarEvents.push({ id: "event-" + Date.now() + "-visit", sourceVisitId: rec.id, type: "showing", title: "Site viewing", date: date, time: time, location: rec.location, reminder: rec.remind, notes: rec.notes, status: "scheduled", createdAt: rec.createdAt, updatedAt: rec.createdAt });
      l.activity = l.activity || [];
      l.activity.push({ date: rec.createdAt, text: "Site viewing scheduled for " + date + " " + time + (rec.location ? " at " + rec.location : "") });
      l.updatedAt = rec.createdAt;
    }
    closeVisitModal();
    save(); render();
    syncLead(l);
    toast("Site viewing scheduled");
  }
  function visitSetStatus(id, status) {
    const v = (state.siteVisits || []).find(x => x.id === id);
    if (!v) return;
    v.status = status;
    const l = (state.leads || []).find(x => x.id === v.leadId);
    if (l) {
      const ev = (l.calendarEvents || []).find(x => x.sourceVisitId === id);
      if (ev) { ev.status = status === "done" ? "completed" : status; ev.updatedAt = new Date().toISOString(); }
      l.updatedAt = new Date().toISOString();
    }
    if (status === "done") {
      if (l) { l.status = "site-visit"; l.activity = l.activity || []; l.activity.push({ date: new Date().toISOString(), text: "Site viewing completed — " + (v.location || "property") }); syncLead(l); }
    }
    else syncLead(l);
    save(); render(); toast("Visit marked " + status);
  }

  /* ================= FINANCING ================= */
  const FIN_TYPES = [["bank", "Bank financing"], ["pagibig", "Pag-IBIG (HDMF) housing loan"], ["inhouse", "In-house / developer financing"], ["cash", "Cash"]];
  function finCompute(p) {
    p = p || {};
    const price = C.num(p.price, 0);
    const dpPct = C.num(p.dpPct, 20);
    const dpMonths = Math.max(1, Math.round(C.num(p.dpMonths, 12)));
    const rate = C.num(p.rate, p.finType === "pagibig" ? 6.5 : (p.finType === "inhouse" ? 9 : 7.5));
    const years = Math.max(1, Math.round(C.num(p.years, 15)));
    const dpTotal = price * dpPct / 100;
    const dpMonthly = dpTotal / dpMonths;
    const loan = price - dpTotal;
    const am = C.calcAmortization(loan, rate, years);
    return {
      price: price, dpPct: dpPct, dpMonths: dpMonths, rate: rate, years: years,
      dpTotal: dpTotal, dpMonthly: dpMonthly, loan: loan,
      monthly: am.monthly, totalPayment: am.totalPayment, totalInterest: am.totalInterest, n: am.n,
      maxLoan: 6000000
    };
  }
  function pagibigEligible(p) {
    const c = finCompute(p);
    const income = C.num(p.monthlyIncome, 0);
    const affordableMonthly = income * 0.35;
    let maxAffordable = 0;
    if (c.rate > 0) {
      const r = c.rate / 100 / 12, n = c.years * 12;
      const f = Math.pow(1 + r, n);
      maxAffordable = affordableMonthly > 0 && (f - 1) > 0 ? affordableMonthly * (f - 1) / (r * f) : 0;
    } else { maxAffordable = affordableMonthly * c.years * 12; }
    maxAffordable = Math.min(maxAffordable, 6000000);
    return { income: income, affordableMonthly: affordableMonthly, maxAffordable: maxAffordable, eligible: maxAffordable >= c.loan, monthly: c.monthly };
  }  function ccClosingCosts() {
    const $v = id => { const el = document.getElementById(id); return el ? el.value : ""; };
    const P = Number($v("cc-price")) || 0;
    const type = $v("cc-type") || "house-lot";
    const inMM = $v("cc-loc") === "mm";
    const conv = $v("cc-conv") || "std";
    const vatNew = document.getElementById("cc-vatnew") && document.getElementById("cc-vatnew").checked;
    const commPct = Number($v("cc-comm")) || 0;
    const out = document.getElementById("cc-out");
    if (!out) return;
    if (P <= 0) { out.innerHTML = '<p class="dim">Enter a selling price first.</p>'; return; }
    const thresholds = { "lot": 1919500, "house-lot": 3600000, "condo": 3199200, "commercial": Infinity };
    let vat = 0;
    if (vatNew && P > thresholds[type]) vat = P * 0.12;
    const cgt = P * 0.06;
    const dst = P * 0.015;
    const transfer = P * (inMM ? 0.0075 : 0.005);
    const registration = P * 0.0025;
    const commission = P * commPct / 100;
    let seller = [["Capital gains tax (6%)", cgt], ["Documentary stamp tax (1.5%)", dst]];
    let buyer = [["Transfer tax (" + (inMM ? "0.75" : "0.5") + "%)", transfer], ["Registration fee (0.25%)", registration]];
    if (commPct > 0) seller.push(["Agent commission (" + commPct + "%)", commission]);
    if (conv === "buyer") { buyer = buyer.concat(seller.splice(0)); }
    else if (conv === "seller") { seller = seller.concat(buyer.splice(0)); }
    const sum = arr => arr.reduce((s, r) => s + r[1], 0);
    const rows = arr => arr.map(r => '<tr><td>' + r[0] + '</td><td class="num">' + C.money(r[1]) + '</td></tr>').join("");
    let html = '';
    if (vat > 0) html += '<table class="data mb-16"><tr><th colspan="2">VAT (12%) - added on top of price</th></tr><tr><td>If your quoted price is VAT-inclusive, do not add this line; instead divide price by 1.12 for the tax base.</td><td class="num">' + C.money(vat) + '</td></tr></table>';
    html += '<div class="grid grid-2"><div><b>Seller pays</b><table class="data mt-8">' + rows(seller) + '<tr><td><b>Total</b></td><td class="num"><b>' + C.money(sum(seller)) + '</b></td></tr></table></div>';
    html += '<div><b>Buyer pays</b><table class="data mt-8">' + rows(buyer) + '<tr><td><b>Cash needed to close</b></td><td class="num"><b>' + C.money(sum(buyer)) + '</b></td></tr></table></div></div>';
    out.innerHTML = html;
  }

  function renderFinancing() {
    const last = state.financingDraft || (state.financingScenarios || [])[0] || {};
    const c = finCompute(last);
    const row = (k, v, extra) => '<tr><td>' + k + "</td><td>" + (v === "" || v === null ? "—" : v) + "</td><td>" + (extra || "") + "</td></tr>";
    let html = '<div class="hero"><div><h1>Financing</h1><p>Estimate in-house, bank, and Pag-IBIG (HDMF) housing loan options for any property price.</p></div>' +
      '<div class="actions"><button class="btn btn-primary" data-fin-new>' + icon("plus", 15) + " New Scenario</button></div></div>";
    html += '<div class="notice-banner">' + icon("spark", 14) + ' <span>All figures are <b>estimates only</b> and subject to verification by the lender. Interest rates and Pag-IBIG caps change; this tool does not provide financial, legal, or tax advice.</span></div>';
    html += '<div class="grid grid-3 mb-24">';
    html += '<div class="card card-pad" style="grid-column:span 2"><h3>Scenario Builder</h3><div class="grid grid-2 mt-8">' +
      '<div class="field"><label>Property price (₱)</label><input class="input input-num" id="fin-price" type="text" inputmode="decimal" value="' + (c.price ? C.fmtNum(c.price) : "6,000,000") + '"></div>' +
      '<div class="field"><label>Financing type</label><select class="input" id="fin-type">' + FIN_TYPES.map(x => '<option value="' + x[0] + '"' + ((last.finType || "bank") === x[0] ? " selected" : "") + ">" + x[1] + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Down payment (%)</label><input class="input input-num" id="fin-dppct" type="text" inputmode="decimal" value="' + (last.dpPct || 20) + '"></div>' +
      '<div class="field"><label>Down payment months (spread)</label><input class="input input-num" id="fin-dpmon" type="text" inputmode="decimal" value="' + (last.dpMonths || 12) + '"></div>' +
      '<div class="field"><label>Annual interest rate (%)</label><input class="input input-num" id="fin-rate" type="text" inputmode="decimal" value="' + (last.rate || c.rate) + '"></div>' +
      '<div class="field"><label>Loan term (years)</label><input class="input input-num" id="fin-years" type="text" inputmode="decimal" value="' + (last.years || 15) + '"></div>' +
      '<div class="field" style="grid-column:span 2"><label>Monthly income (Pag-IBIG eligibility)</label><input class="input input-num" id="fin-income" type="text" inputmode="decimal" value="' + (last.monthlyIncome ? C.fmtNum(last.monthlyIncome) : "") + '" placeholder="e.g. 60,000"></div>' +
      "</div>" +
      '<div class="row mt-8" style="gap:8px"><button class="btn btn-primary" data-fin-calc>' + icon("chart", 15) + " Compute</button>" +
      '<button class="btn btn-ghost" data-fin-save>' + icon("check", 15) + " Save Scenario</button></div></div>";
    html += '<div class="card card-pad"><h3>Estimate</h3><div class="fin-est mt-8">' +
      '<div class="fin-est-big">' + C.money(c.monthly) + '<div class="dim tiny">monthly amortization</div></div>' +
      '<div class="table-wrap mt-8"><table class="data"><tbody>' +
      row("Property price", C.money(c.price)) +
      row("Down payment", C.money(c.dpTotal) + " <span class='dim'>(" + c.dpPct + "%)</span>") +
      row("Monthly DP spread", C.money(c.dpMonthly) + " <span class='dim'>× " + c.dpMonths + " months</span>") +
      row("Loan amount", C.money(c.loan)) +
      row("Monthly amortization", C.money(c.monthly)) +
      row("Total interest", C.money(c.totalInterest)) +
      row("Loan term", c.years + " years (" + c.n + " months)") +
      row("Pag-IBIG max loan", C.money(c.maxLoan)) +
      "</tbody></table></div></div></div>";
    const pg = pagibigEligible(Object.assign({}, last, { monthlyIncome: C.num(last.monthlyIncome, 0), price: c.price, dpPct: c.dpPct, rate: c.rate, years: c.years }));
    html += '<div class="card card-pad mb-24"><h3>Pag-IBIG (HDMF) Eligibility Check</h3>' +
      '<div class="table-wrap mt-8"><table class="data"><tbody>' +
      row("Monthly income", C.money(pg.income)) +
      row("Affordable monthly (35% of income)", C.money(pg.affordableMonthly)) +
      row("Max affordable loan (est.)", C.money(pg.maxAffordable)) +
      row("Result", pg.eligible ? '<span style="color:#34C77B">Eligible for this scenario</span>' : '<span style="color:#F26B5B">Income likely insufficient — reduce price/DP or raise income</span>') +
      "</tbody></table></div>" +
      '<div class="notice-banner mt-8">' + icon("shield", 14) + " Pag-IBIG limits (e.g. max loan, interest rates) change periodically and depend on membership. Verify with HDMF before relying on any number.</div></div>";
    html += '<div class="card card-pad"><h3>Saved Scenarios</h3>' + (state.financingScenarios && state.financingScenarios.length ?
      '<div class="table-wrap mt-8"><table class="data"><thead><tr><th>Label</th><th>Price</th><th>DP</th><th>Loan</th><th>Monthly</th><th></th></tr></thead><tbody>' +
      state.financingScenarios.map(s => '<tr><td>' + esc(s.label || "Scenario") + "</td><td>" + C.money(s.price) + "</td><td>" + s.dpPct + "%</td><td>" + C.money(s.price - (s.price * s.dpPct / 100)) + "</td><td>" + C.money(s.monthly) + "</td>" +
        '<td><button class="icon-btn btn-sm" data-fin-open="' + esc(s.id) + '" title="Load">' + icon("back", 14) + '</button> <button class="icon-btn btn-sm" data-fin-vault="' + esc(s.id) + '" title="Pre-approval documents">' + icon("folder", 14) + '</button> <button class="icon-btn btn-sm" data-fin-del="' + esc(s.id) + '" title="Delete">' + icon("trash", 13) + '</button></td></tr>').join("") +
      "</tbody></table></div>" : '<div class="dim mt-8">No saved scenarios yet — compute and save one above.</div>') + "</div>" +
      '<div class="card card-pad mb-24" id="closing-costs"><h3 class="mb-16">Closing Cost Calculator</h3><p class="dim tiny mb-16">Philippine practice estimates. LGU rates vary; confirm final figures with BIR / Register of Deeds.</p><div class="grid grid-2"><label class="field"><span>Selling price (PHP)</span><input class="input input-num" id="cc-price" type="number" min="0" placeholder="5000000"></label><label class="field"><span>Property type</span><select class="input" id="cc-type"><option value="house-lot">House & Lot</option><option value="condo">Condominium</option><option value="lot">Residential Lot</option><option value="commercial">Commercial / Other</option></select></label><label class="field"><span>Location</span><select class="input" id="cc-loc"><option value="mm">Metro Manila</option><option value="prov">Province</option></select></label><label class="field"><span>Paying convention</span><select class="input" id="cc-conv"><option value="std">Standard PH split</option><option value="buyer">Buyer pays everything</option><option value="seller">Seller pays everything</option></select></label><label class="field" style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="cc-vatnew"> <span>Brand-new / developer sale (VAT-registered)</span></label><label class="field"><span>Agent commission % (seller side)</span><input class="input input-num" id="cc-comm" type="number" min="0" max="20" step="0.25" value="0"></label></div><button class="btn btn-primary mt-8" data-cc-calc>Compute Closing Costs</button><div id="cc-out"></div></div>';
    return html;
  }
  function finFromForm() {
    const $n = id => { const el = document.getElementById(id); return el ? C.num(el.value, 0) : 0; };
    const $v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const rate = $n("fin-rate"), years = Math.max(1, Math.round($n("fin-years")) || 15);
    return { price: $n("fin-price"), finType: $v("fin-type") || "bank", dpPct: $n("fin-dppct"), dpMonths: $n("fin-dpmon"), rate: rate, years: years, monthlyIncome: $n("fin-income") };
  }
  function finSaveScenario() {
    const p = finFromForm();
    if (!p.price) { toast("Enter a property price first", "err"); return; }
    const c = finCompute(p);
    const rec = Object.assign({ id: "fin-" + Date.now(), label: C.money(p.price) + " · " + p.finType, createdAt: new Date().toISOString() }, p, { monthly: c.monthly });
    if (!state.financingScenarios) state.financingScenarios = [];
    state.financingScenarios.unshift(rec);
    state.financingDraft = rec;
    save(); render();
    toast("Financing scenario saved");
  }
  function finOpenScenario(id) {
    const s = (state.financingScenarios || []).find(x => x.id === id);
    if (!s) return;
    state.financingScenarios = state.financingScenarios.filter(x => x.id !== id);
    state.financingScenarios.unshift(s);
    state.financingDraft = s;
    save(); render();
    toast("Scenario loaded — adjust and recompute");
  }
  function finDeleteScenario(id) {
    state.financingScenarios = (state.financingScenarios || []).filter(x => x.id !== id);
    save(); render(); toast("Scenario deleted", "err");
  }
  let finHooked = false;
  function bindFinancing() {
    if (!finHooked) {
      finHooked = true;
      document.addEventListener("click", e => {
        const pir = e.target.closest("[data-pi-refresh]");
    if (pir) { state.pmsInsightsLoaded = false; loadPmsInsights().then(() => render()); return; }
const tpr = e.target.closest("[data-tperf-refresh]");
    if (tpr) { state.teamPerformanceLoaded = false; loadTeamPerformance().then(() => render()); return; }
const ccBtn = e.target.closest("[data-cc-calc]");
    if (ccBtn) { ccClosingCosts(); return; }
    const cal = e.target.closest("[data-fin-calc]");
        if (cal) { const p = finFromForm(); const c = finCompute(p); state.financingDraft = p; save(); render(); toast("Computed: ₱" + C.fmtNum(Math.round(c.monthly)) + "/mo"); return; }
        const nw = e.target.closest("[data-fin-new]");
        if (nw) { state.financingDraft = null; save(); render(); return; }
        const sv = e.target.closest("[data-fin-save]");
        if (sv) { finSaveScenario(); return; }
        const op = e.target.closest("[data-fin-open]");
        if (op) { finOpenScenario(op.getAttribute("data-fin-open")); return; }
        const dl = e.target.closest("[data-fin-del]");
        if (dl) { finDeleteScenario(dl.getAttribute("data-fin-del")); return; }
        const vl = e.target.closest("[data-fin-vault]");
        if (vl) { openVault("financing", vl.getAttribute("data-fin-vault"), "Financing / Pre-approval Documents"); return; }
      });
    }
  }

  /* ================= TRANSACTIONS ================= */
  const TX_STAGES = [
    { value: "reservation", label: "Reservation", color: "blue" },
    { value: "cts", label: "Contract to Sell", color: "gold" },
    { value: "doas", label: "Deed of Absolute Sale", color: "purple" },
    { value: "done", label: "Completed", color: "green" }
  ];
  const TX_STAGE_ORDER = ["reservation", "cts", "doas", "done"];
  function txStageCfg(s) { return TX_STAGES.find(x => x.value === s) || TX_STAGES[0]; }
  function txStatusBadge(s) { const c = txStageCfg(s); return '<span class="badge ' + c.color + '">' + c.label + "</span>"; }
  function txDocChecklist() {
    return [
      { k: "id", label: "Valid government-issued ID (buyer & seller)" },
      { k: "tin", label: "TIN certificate / BIR forms" },
      { k: "marriage", label: "Marriage certificate (if married)" },
      { k: "spa", label: "SPA — Special Power of Attorney (OFW / overseas buyer)" },
      { k: "income", label: "Proof of income (COE, bank statements, ITR)" },
      { k: "bank", label: "Bank / financing documents or pre-approval" },
      { k: "survey", label: "Latest survey plan (for lots)" },
      { k: "title", label: "Certified true copy of title (TCT / CCT)" },
      { k: "taxdec", label: "Tax declaration" },
      { k: "authority", label: "Authority to Sell / owner SPA to broker" }
    ];
  }
  function txCompute(t) {
    const price = C.num(t.price, 0);
    const dpPct = C.num(t.dpPct, 20);
    const dpMonths = Math.max(1, Math.round(C.num(t.dpMonths, 12)));
    const rate = C.num(t.rate, 7.5);
    const years = Math.max(1, Math.round(C.num(t.years, 15)));
    const dpTotal = price * dpPct / 100;
    const dpMonthly = dpTotal / dpMonths;
    const loan = price - dpTotal;
    const am = C.calcAmortization(loan, rate, years);
    const reservationFee = C.num(t.reservationFee, Math.min(Math.max(price * 0.05, 10000), 50000));
    const dpSchedule = [];
    for (let i = 1; i <= dpMonths; i++) dpSchedule.push({ m: i, amount: dpMonthly, balance: dpTotal - dpMonthly * i });
    return { price: price, dpPct: dpPct, dpMonths: dpMonths, dpTotal: dpTotal, dpMonthly: dpMonthly, loan: loan, monthly: am.monthly, totalInterest: am.totalInterest, reservationFee: reservationFee, dpSchedule: dpSchedule, rate: rate, years: years, n: am.n };
  }
  function txCostEstimator(t) {
    const price = C.num(t.price, 0);
    const cgt = price * 0.06;
    const dst = price * 0.015;
    const transferTax = price * (C.num(t.transferPct, 0.5) / 100);
    const registration = Math.min(price * 0.01, 50000) + 2000;
    const notarial = C.num(t.notarialFee, 5000);
    const total = cgt + dst + transferTax + registration + notarial;
    return { cgt: cgt, dst: dst, transferTax: transferTax, transferPct: C.num(t.transferPct, 0.5), registration: registration, notarial: notarial, total: total, price: price };
  }
  function ensureTransactions() {
    if (!state.transactions) state.transactions = [];
    if (!state.transactions.length && (!currentUser || currentUser.demo || (IS_LOCAL_DEV && !currentUser.id))) state.transactions = seedTransactions();
  }
  function seedTransactions() {
    const mk = (o, i) => Object.assign({
      id: "tx-seed-" + (i + 1), ref: "TX-" + String(i + 1).padStart(4, "0"),
      createdAt: new Date(Date.now() - (60 - i * 15) * 86400000).toISOString(), updatedAt: new Date(Date.now() - (60 - i * 15) * 86400000).toISOString(),
      stage: "reservation", title: "", buyerName: "", sellerName: "", agentName: "", referralName: "",
      price: 0, dpPct: 20, dpMonths: 12, rate: 7.5, years: 15, reservationFee: 0,
      reservationDate: "", ctsDate: "", doasDate: "", transferPct: 0.5, notarialFee: 5000,
      checklist: [], payout: "pending", listingId: ""
    }, o);
    const d = state.deals && state.deals.length ? state.deals[0] : null;
    const base = d ? { price: C.num(d.data.purchase.price, 4500000), title: (d.data.property.name || "Sample Deal") + " — sale" } : { price: 4500000, title: "Sample residential lot — sale" };
    return [
      mk(Object.assign({ stage: "cts", reservationFee: 25000, reservationDate: new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10), ctsDate: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10), buyerName: "Maria Santos", sellerName: "Liza Mendoza", agentName: "Anna Dela Cruz", checklist: ["id", "tin", "income"] }, base), 1),
      mk({ stage: "reservation", title: "One Orchard 1BR Condo (Pre-Selling) — reservation", price: 7200000, reservationFee: 50000, reservationDate: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10), buyerName: "Ramon Garcia", sellerName: "Rockwell Land (developer)", agentName: "Joshua Reyes", listingId: "lst-seed-2", checklist: ["id", "spa", "bank"] }, 2)
    ];
  }
  function txCanManage() { return can("transactions.manage") && !roleIs("agent"); }
  function transactionScope() {
    const all = state.transactions || [];
    if (!currentUser || currentUser.demo || roleIs("super-admin")) return all;
    if (roleIs("broker")) return all.filter(t => t.brokerId === currentUser.id || t.createdBy === currentUser.id);
    if (roleIs("agent")) return all.filter(t => currentUser.brokerId && t.brokerId === currentUser.brokerId);
    return [];
  }
  function txRef() { return "TX-" + String(transactionScope().length + 1).padStart(4, "0"); }
  function txLinkedTitle(t) {
    if (!t || !t.listingId) return "";
    const l = (state.listings || []).find(x => x.id === t.listingId);
    return l ? l.title : String(t.listingId);
  }
  function txListingDetailHTML(l) {
    if (!l) return "";
    const v = x => x === "" || x === null || x === undefined ? "" : esc(String(x));
    const rows = [
      ["Reference", v(l.ref)],
      ["Property type", v(l.propertyType)],
      ["Status", v(listStatusLabel(l.status))],
      ["Price", listingDisplayPrice(l)],
      ["Location", v([l.address, l.barangay, l.city, l.province].filter(Boolean).join(", "))],
      ["Developer", v(l.developer)],
      ["Lot area", l.lotArea ? v(C.num(l.lotArea, 0).toLocaleString() + " sqm") : ""],
      ["Floor area", l.floorArea ? v(C.num(l.floorArea, 0).toLocaleString() + " sqm") : ""],
      ["Bedrooms", l.bedrooms ? v(l.bedrooms + " BR") : ""],
      ["Bathrooms", l.bathrooms ? v(l.bathrooms + " BA") : ""],
      ["Parking", l.parking ? v(l.parking + " slot" + (Number(l.parking) > 1 ? "s" : "")) : ""],
      ["Floors", v(l.floors)]
    ];
    return '<div class="dim tiny mt-8">Property details</div><div class="table-wrap mt-8"><table class="data"><tbody>' + rows.map(r => txRow(r[0], r[1])).join("") + "</tbody></table></div>";
  }
  function syncTransactionsToListings() {
    if (!state.transactions || !state.listings) return 0;
    let changed = 0;
    state.transactions.forEach(t => {
      if (!t || !t.listingId) return;
      const l = (state.listings || []).find(x => x.id === t.listingId);
      if (!l) return;
      const lp = C.num(l.price, 0);
      const tp = C.num(t.price, 0);
      if (lp > 0 && tp !== lp) {
        t.price = lp;
        t.updatedAt = new Date().toISOString();
        changed++;
        persistTransactionToCloud(t);
      }
    });
    return changed;
  }
  function txCard(t) {
    const c = txCompute(t);
    const lt = txLinkedTitle(t);
    return '<div class="tx-card card card-pad" data-tx-open="' + esc(t.id) + '">' +
      '<div class="row spread"><div class="grow"><div class="tx-title">' + esc(t.title || "Untitled transaction") + "</div>" +
      '<div class="dim tiny">' + esc(t.ref || "") + " · " + esc(t.buyerName || "Buyer") + (t.sellerName ? " ← " + esc(t.sellerName) : "") + (lt ? " · " + esc(lt) : "") + '</div></div><div class="row" style="gap:6px">' + txStatusBadge(t.stage) + '<button class="btn btn-ghost btn-sm" data-tx-print="' + esc(t.id) + '" title="Print transaction">' + icon("print", 13) + ' Print</button></div></div>' +
      '<div class="row mt-8" style="gap:16px"><div><div class="tx-price">' + C.money(c.price) + '</div><div class="dim tiny">Price</div></div>' +
      '<div><div class="tx-price">' + C.money(c.monthly) + '</div><div class="dim tiny">Est. monthly (loan)</div></div>' +
      '<div><div class="tx-price">' + C.money(c.dpTotal) + '</div><div class="dim tiny">Down payment</div></div></div>' +
      (t.stage === "doas" || t.stage === "done" ? '<div class="mt-8"><div class="dim tiny">Closing costs (est.)</div><div class="tx-price">' + C.money(txCostEstimator(t).total) + "</div></div>" : "") +
      "</div>";
  }
  function renderTransactions() {
    if (state.txDetail) {
      const t = transactionScope().find(x => x.id === state.txDetail);
      if (t) return renderTransactionDetail(t);
      state.txDetail = null;
    }
    const canManageTx = txCanManage();
    let html = '<div class="hero"><div><h1>Transactions</h1><p>Reservation &rarr; Contract to Sell &rarr; Deed of Absolute Sale &rarr; Completed, with computation sheets and closing-cost estimates.</p></div>' +
      '<div class="actions">' + (canManageTx ? '<button class="btn btn-primary" data-tx-new>' + icon("plus", 15) + " New Transaction</button>" : "") + "</div></div>";
    html += roleIs("agent") ? '<div class="notice-banner">' + icon("shield", 14) + '<span>Read-only transactions shared by your linked licensed broker.</span></div>' : '<div class="notice-banner">' + icon("shield", 14) + ' <span>Computation sheets and transfer-cost figures are <b>estimates only</b>, subject to verification by the LGU, BIR, Registry of Deeds, and notary. This system does not provide legal or tax advice. Have a licensed broker or lawyer review documents before signing.</span></div>';
    const arr = transactionScope().slice().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    html += arr.length ? '<div class="tx-grid mt-16">' + arr.map(txCard).join("") + "</div>" : '<div class="card card-pad empty mt-16">' + icon("file", 40) + "<h3>No transactions yet</h3><p>Start a reservation to track a deal through closing.</p></div>";
    return html;
  }
  function txRow(k, v) { return "<tr><td>" + k + "</td><td>" + (v === "" || v === null ? "—" : v) + "</td></tr>"; }
  function renderTransactionDetail(t) {
    const c = txCompute(t);
    const est = txCostEstimator(t);
    const canManageTx = txCanManage();
    const cl = txDocChecklist();
    const done = t.checklist || [];
    const txDocs = vaultDocs("tx", t.id);
    const checklistPct = cl.length ? Math.round(done.length / cl.length * 100) : 0;
    const lt = txLinkedTitle(t);
    const ltLink = lt && t.listingId ? (state.listings || []).find(x => x.id === t.listingId) : null;
    let html = '<div class="hero"><div><button class="btn btn-ghost btn-sm" data-tx-back>' + icon("back", 13) + " Back to transactions</button>" +
      '<h1 class="mt-8">' + esc(t.title || "Transaction") + "</h1><div class='row mt-8' style='gap:8px'>" + txStatusBadge(t.stage) + '<span class="badge blue">' + esc(t.ref || "") + "</span></div></div>" +
      '<div class="actions"><button class="btn btn-ghost btn-sm" data-tx-print="' + esc(t.id) + '">' + icon("print", 14) + ' Print Transaction</button>' + (canManageTx ? '<button class="btn btn-ghost btn-sm" data-tx-edit="' + esc(t.id) + '">' + icon("edit", 14) + " Edit</button>" +
      (t.stage !== "done" ? '<button class="btn btn-primary" data-tx-advance="' + esc(t.id) + '">' + icon("arrow", 14) + " Advance to " + esc((txStageCfg(TX_STAGE_ORDER[Math.min(TX_STAGE_ORDER.indexOf(t.stage) + 1, TX_STAGE_ORDER.length - 1)]).label)) + "</button>" : "") +
      '<button class="btn btn-ghost btn-sm" data-tx-del="' + esc(t.id) + '">' + icon("trash", 14) + " Delete</button>" : "") + "</div></div>";
    html += '<div class="grid grid-3 mb-24">';
    html += '<div class="card card-pad" style="grid-column:span 2"><h3>Parties</h3><div class="table-wrap mt-8"><table class="data"><tbody>' +
      txRow("Linked listing", lt ? (ltLink ? '<a class="link" data-tx-goto-listing="' + esc(ltLink.id) + '">' + esc(lt) + "</a>" : esc(lt)) : "") +
      txRow("Buyer / Client", t.buyerName) + txRow("Seller / Developer", t.sellerName) +
      txRow("Handling agent", t.agentName) + txRow("Referral (if any)", t.referralName) +
      txRow("Price", C.money(c.price)) + txRow("Reservation fee", C.money(c.reservationFee)) +
      (t.reservationDate ? txRow("Reservation date", t.reservationDate) : "") +
      (t.ctsDate ? txRow("Contract to Sell date", t.ctsDate) : "") +
      (t.doasDate ? txRow("Deed of Absolute Sale date", t.doasDate) : "") +
      "</tbody></table></div></div>";
    html += '<div class="card card-pad"><h3>Milestones</h3><div class="mt-8">' + TX_STAGES.map(s => {
      const reached = TX_STAGE_ORDER.indexOf(s.value) <= TX_STAGE_ORDER.indexOf(t.stage);
      return '<div class="tx-milestone' + (reached ? " on" : "") + '"><div class="tx-milestone-dot"></div><div class="grow">' + esc(s.label) + (s.value === t.stage ? " <span class='dim tiny'>current</span>" : "") + "</div></div>";
    }).join("") + "</div></div>";
    html += "</div>";
    html += '<div class="grid grid-3 mb-24">';
    html += '<div class="card card-pad" style="grid-column:span 2"><h3>Computation Sheet</h3><div class="table-wrap mt-8"><table class="data"><tbody>' +
      txRow("Price", C.money(c.price)) +
      txRow("Down payment (" + c.dpPct + "%)", C.money(c.dpTotal)) +
      txRow("Monthly DP spread", C.money(c.dpMonthly) + " <span class='dim'>× " + c.dpMonths + " months</span>") +
      txRow("Loan amount (balance)", C.money(c.loan)) +
      txRow("Financing rate", c.rate + "% annual · " + c.years + " yrs") +
      txRow("Monthly amortization (est.)", C.money(c.monthly)) +
      txRow("Total interest (est.)", C.money(c.totalInterest)) +
      "</tbody></table></div>" +
      '<h3 class="mt-16">Down Payment Schedule</h3><div class="table-wrap mt-8" style="max-height:260px;overflow:auto"><table class="data"><thead><tr><th>#</th><th>Amount</th><th>Balance</th></tr></thead><tbody>' +
      c.dpSchedule.map(r => "<tr><td>" + r.m + "</td><td>" + C.money(r.amount) + "</td><td>" + C.money(Math.max(r.balance, 0)) + "</td></tr>").join("") +
      "</tbody></table></div></div>";
    html += '<div class="card card-pad"><h3>Transfer Cost Estimator</h3>' +
      '<div class="table-wrap mt-8"><table class="data"><tbody>' +
      txRow("Capital Gains Tax (6%)", C.money(est.cgt)) +
      txRow("Documentary Stamp Tax (1.5%)", C.money(est.dst)) +
      txRow("Transfer tax (" + est.transferPct + "% LGU)", C.money(est.transferTax)) +
      txRow("Registration fees", C.money(est.registration)) +
      txRow("Notarial fees", C.money(est.notarial)) +
      txRow("Total estimated closing costs", '<b>' + C.money(est.total) + "</b>") +
      "</tbody></table></div>" +
      '<div class="notice-banner mt-8">' + icon("shield", 14) + ' Estimates only — verify current BIR rates, LGU transfer tax, and Registry of Deeds fees. CGT/DST are typically seller costs; allocation is negotiable. Not tax or legal advice.</div></div>';
    html += "</div>";
    html += '<div class="card card-pad mb-24"><div class="row spread tx-doc-heading"><div><h3>Document Checklist</h3><p class="dim mt-8">Track required buyer, seller, tax, title, and transfer records.</p></div><div class="tx-doc-progress-label"><b>' + done.length + '/' + cl.length + '</b><span>complete</span></div></div><div class="tx-doc-progress"><i style="width:' + checklistPct + '%"></i></div><div class="chk-grid mt-8">' +
      cl.map(x => { const ch = done.indexOf(x.k) >= 0; return '<label class="ms-chk"><input type="checkbox" data-tx-chk="' + esc(t.id) + '" data-chk-key="' + esc(x.k) + '"' + (ch ? " checked" : "") + (!canManageTx ? " disabled" : "") + "> " + esc(x.label) + "</label>"; }).join("") + "</div></div>";
    html += '<div class="card card-pad mb-24 tx-documents"><div class="row spread tx-doc-heading"><div><div class="row" style="gap:8px"><h3>Transaction Documents</h3><span class="badge blue">' + txDocs.length + ' file' + (txDocs.length === 1 ? "" : "s") + '</span></div><div class="dim mt-8">Reservation, contracts, title records, BIR clearances, receipts, and closing documents.</div></div>' +
      (canManageTx ? '<button class="btn btn-primary btn-sm" data-tx-vault="' + esc(t.id) + '">' + icon("folder", 14) + " Manage Documents</button>" : "") + '</div><div class="vault-list tx-vault-list">' +
      (txDocs.length ? txDocs.map(d => vaultDocRow(d, !canManageTx)).join("") : '<div class="vault-empty compact">' + icon("folder", 28) + '<b>No transaction documents</b><span>Upload the reservation agreement, contracts, title and closing records.</span></div>') + "</div></div>";
    return html;
  }
  function printTransaction(id) {
    const t = transactionScope().find(x => x.id === id);
    if (!t) { toast("Transaction not found", "err"); return; }
    const c = txCompute(t);
    const est = txCostEstimator(t);
    const checklist = txDocChecklist();
    const done = t.checklist || [];
    const docs = vaultDocs("tx", t.id);
    const row = (label, value) => '<tr><td><b>' + esc(label) + '</b></td><td>' + esc(value == null || value === "" ? "—" : String(value)) + '</td></tr>';
    const moneyRow = (label, value) => row(label, C.money(value));
    const stage = txStageCfg(t.stage);
    const milestones = TX_STAGES.map(s => {
      const reached = TX_STAGE_ORDER.indexOf(s.value) <= TX_STAGE_ORDER.indexOf(t.stage);
      return '<tr><td>' + esc(s.label) + '</td><td>' + (s.value === t.stage ? '<b>Current</b>' : (reached ? 'Completed' : 'Pending')) + '</td></tr>';
    }).join("");
    const checklistRows = checklist.map(item => '<tr><td>' + esc(item.label) + '</td><td>' + (done.indexOf(item.k) >= 0 ? 'Collected' : 'Pending') + '</td></tr>').join("");
    const documentRows = docs.map(d => '<tr><td>' + esc(d.name || "Document") + '</td><td>' + esc(d.category || "Other") + '</td><td>' + esc(d.size || "—") + '</td><td>' + esc(d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString() : "—") + '</td></tr>').join("");
    const scheduleRows = c.dpSchedule.map(r => '<tr><td>' + r.m + '</td><td>' + esc(C.money(r.amount)) + '</td><td>' + esc(C.money(Math.max(r.balance, 0))) + '</td></tr>').join("");
    const html = '<div class="rpt tx-print-report"><div class="print-brand"><h1>Transaction Report</h1><div>ES Realty</div></div>' +
      '<div class="print-meta"><div><b>Reference:</b> ' + esc(t.ref || "—") + '</div><div><b>Stage:</b> ' + esc(stage ? stage.label : t.stage || "—") + '</div><div><b>Generated:</b> ' + esc(new Date().toLocaleString()) + '</div><div><b>Prepared by:</b> ' + esc((currentUser && currentUser.name) || "ES Realty") + '</div></div>' +
      '<h1>' + esc(t.title || "Transaction") + '</h1>' +
      '<h2>Parties and Property</h2><table>' + row("Linked Listing", txLinkedTitle(t) || "—") + row("Buyer / Client", t.buyerName) + row("Seller / Developer", t.sellerName) + row("Handling Agent", t.agentName) + row("Referral", t.referralName) + row("Reservation Date", t.reservationDate) + row("Contract to Sell Date", t.ctsDate) + row("Deed of Absolute Sale Date", t.doasDate) + '</table>' +
      '<h2>Transaction Computation</h2><table>' + moneyRow("Property Price", c.price) + moneyRow("Reservation Fee", c.reservationFee) + row("Down Payment", c.dpPct + "%") + moneyRow("Total Down Payment", c.dpTotal) + moneyRow("Monthly DP", c.dpMonthly) + moneyRow("Loan Balance", c.loan) + row("Financing", c.rate + "% annually · " + c.years + " years") + moneyRow("Estimated Monthly Amortization", c.monthly) + moneyRow("Estimated Total Interest", c.totalInterest) + '</table>' +
      '<h2>Estimated Transfer and Closing Costs</h2><table>' + moneyRow("Capital Gains Tax (6%)", est.cgt) + moneyRow("Documentary Stamp Tax (1.5%)", est.dst) + moneyRow("Transfer Tax (" + est.transferPct + "%)", est.transferTax) + moneyRow("Registration Fees", est.registration) + moneyRow("Notarial Fees", est.notarial) + moneyRow("Total Estimated Closing Costs", est.total) + '</table>' +
      '<h2>Milestones</h2><table><thead><tr><th>Stage</th><th>Status</th></tr></thead><tbody>' + milestones + '</tbody></table>' +
      '<h2>Down Payment Schedule</h2><table class="print-sched"><thead><tr><th>Month</th><th>Amount</th><th>Balance</th></tr></thead><tbody>' + scheduleRows + '</tbody></table>' +
      '<h2>Document Checklist</h2><table><thead><tr><th>Requirement</th><th>Status</th></tr></thead><tbody>' + checklistRows + '</tbody></table>' +
      '<h2>Attached Documents (' + docs.length + ')</h2><table><thead><tr><th>File</th><th>Category</th><th>Size</th><th>Uploaded</th></tr></thead><tbody>' + (documentRows || '<tr><td colspan="4">No documents attached</td></tr>') + '</tbody></table>' +
      '<div class="tx-print-signatures"><div><span>Broker / Authorized Representative</span></div><div><span>Buyer / Client</span></div><div><span>Seller / Developer</span></div></div>' +
      '<div class="print-foot">Estimates are for reference only. Verify taxes, transfer fees, financing terms, title records, and legal documents with the BIR, LGU, Registry of Deeds, financing institution, and licensed professionals.</div></div>';
    printHTML(html);
  }
  function openTxEditor(id) {
    if (!txCanManage()) { toast("You don't have permission to manage transactions", "err"); return; }
    closeTxModal();
    const t = id ? transactionScope().find(x => x.id === id) || {} : {};
    const listOpts = '<option value="">No linked listing</option>' + (state.listings || []).map(x => '<option value="' + esc(x.id) + '"' + (t.listingId === x.id ? " selected" : "") + ">" + esc(x.title) + "</option>").join("");
    const body =
      '<div class="grid grid-2">' +
      '<div class="field" style="grid-column:span 2"><label>Transaction title *</label><input class="input" id="tx-title" type="text" value="' + esc(t.title || "") + '" placeholder="e.g. 3BR House & Lot in Imus — sale"></div>' +
      '<div class="field"><label>Stage</label><select class="input" id="tx-stage">' + TX_STAGES.map(s => '<option value="' + s.value + '"' + (t.stage === s.value ? " selected" : "") + ">" + s.label + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Price (₱)</label><input class="input input-num" id="tx-price" type="text" inputmode="decimal" value="' + (C.num(t.price, 0) > 0 ? C.fmtNum(t.price) : "") + '"></div>' +
      '<div class="field"><label>Buyer / client</label><input class="input" id="tx-buyer" type="text" value="' + esc(t.buyerName || "") + '"></div>' +
      '<div class="field"><label>Seller / developer</label><input class="input" id="tx-seller" type="text" value="' + esc(t.sellerName || "") + '"></div>' +
      '<div class="field"><label>Handling agent</label><input class="input" id="tx-agent" type="text" value="' + esc(t.agentName || "") + '"></div>' +
      '<div class="field"><label>Referral (if any)</label><input class="input" id="tx-referral" type="text" value="' + esc(t.referralName || "") + '"></div>' +
      '<div class="field"><label>Reservation fee (₱)</label><input class="input input-num" id="tx-resfee" type="text" inputmode="decimal" value="' + (C.num(t.reservationFee, 0) > 0 ? C.fmtNum(t.reservationFee) : "") + '" placeholder="auto ~5% up to ₱50k"></div>' +
      '<div class="field"><label>Reservation date</label><input class="input" id="tx-resdate" type="date" value="' + esc(t.reservationDate || "") + '"></div>' +
      '<div class="field"><label>Down payment (%)</label><input class="input input-num" id="tx-dppct" type="text" inputmode="decimal" value="' + (t.dpPct || 20) + '"></div>' +
      '<div class="field"><label>DP spread (months)</label><input class="input input-num" id="tx-dpmon" type="text" inputmode="decimal" value="' + (t.dpMonths || 12) + '"></div>' +
      '<div class="field"><label>Loan interest (%)</label><input class="input input-num" id="tx-rate" type="text" inputmode="decimal" value="' + (t.rate || 7.5) + '"></div>' +
      '<div class="field"><label>Loan term (years)</label><input class="input input-num" id="tx-years" type="text" inputmode="decimal" value="' + (t.years || 15) + '"></div>' +
      '<div class="field"><label>CTS date</label><input class="input" id="tx-ctsdate" type="date" value="' + esc(t.ctsDate || "") + '"></div>' +
      '<div class="field"><label>DOAS date</label><input class="input" id="tx-doasdate" type="date" value="' + esc(t.doasDate || "") + '"></div>' +
      '<div class="field"><label>Transfer tax (%)</label><input class="input input-num" id="tx-transferpct" type="text" inputmode="decimal" value="' + (t.transferPct || 0.5) + '" placeholder="LGU ~0.5–0.75%"></div>' +
      '<div class="field"><label>Notarial fee (₱)</label><input class="input input-num" id="tx-notarial" type="text" inputmode="decimal" value="' + (t.notarialFee || 5000) + '"></div>' +
      '<div class="field" style="grid-column:span 2"><label>Linked listing</label><select class="input" id="tx-listing">' + listOpts + '</select><div id="tx-listing-detail"></div></div>' +
      "</div>";
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "tx-modal";
    ov.setAttribute("data-edit-id", id || "");
    ov.innerHTML = '<div class="modal-card modal-card-wide"><div class="modal-head"><h3>' + (id ? "Edit Transaction" : "New Transaction") + '</h3><button class="icon-btn" data-tx-cancel title="Close">&times;</button></div>' +
      '<div class="modal-body" style="max-height:70vh;overflow:auto">' + body + "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-tx-cancel>Cancel</button><button class="btn btn-primary" data-tx-save>' + icon("check", 15) + " Save Transaction</button></div></div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeTxModal(); });
    const lsSel = $("#tx-listing");
    if (lsSel) lsSel.addEventListener("change", function () {
      const match = (state.listings || []).find(x => x.id === lsSel.value);
      const wrap = $("#tx-listing-detail");
      if (wrap) wrap.innerHTML = txListingDetailHTML(match);
      const priceEl = $("#tx-price");
      if (match && priceEl && C.num(priceEl.value, 0) <= 0 && C.num(match.price, 0) > 0) priceEl.value = C.fmtNum(match.price);
    });
    if (t.listingId) {
      const wrap = $("#tx-listing-detail");
      if (wrap) wrap.innerHTML = txListingDetailHTML((state.listings || []).find(x => x.id === t.listingId));
    }
  }
  function closeTxModal() { const m = $("#tx-modal"); if (m) m.remove(); }
  function txSaveForm() {
    if (!txCanManage()) { toast("You don't have permission to manage transactions", "err"); return; }
    const $v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const $n = id => { const el = document.getElementById(id); return el ? C.num(el.value, 0) : 0; };
    const title = $v("tx-title");
    if (!title) { toast("Transaction title is required", "err"); return; }
    const m = $("#tx-modal");
    const editId = m ? (m.getAttribute("data-edit-id") || "") : "";
    const rec = editId ? ((state.transactions || []).find(x => x.id === editId) || {}) : {};
    rec.id = rec.id || ("tx-" + Date.now() + "-" + Math.floor(Math.random() * 999));
    rec.ref = rec.ref || txRef();
    rec.title = title;
    rec.stage = $v("tx-stage") || "reservation";
    rec.price = $n("tx-price");
    rec.buyerName = $v("tx-buyer");
    rec.sellerName = $v("tx-seller");
    rec.agentName = $v("tx-agent");
    rec.referralName = $v("tx-referral");
    rec.reservationFee = $n("tx-resfee");
    rec.reservationDate = $v("tx-resdate");
    rec.dpPct = $n("tx-dppct") || 20;
    rec.dpMonths = $n("tx-dpmon") || 12;
    rec.rate = $n("tx-rate") || 7.5;
    rec.years = $n("tx-years") || 15;
    rec.ctsDate = $v("tx-ctsdate");
    rec.doasDate = $v("tx-doasdate");
    rec.transferPct = $n("tx-transferpct") || 0.5;
    rec.notarialFee = $n("tx-notarial") || 5000;
    rec.listingId = $v("tx-listing");
    rec.updatedAt = new Date().toISOString();
    if (!rec.createdAt) rec.createdAt = rec.updatedAt;
    if (!rec.createdBy) rec.createdBy = currentUser && currentUser.id;
    if (!rec.brokerId) rec.brokerId = currentUser && currentUser.id;
    if (!rec.checklist) rec.checklist = [];
    if (!state.transactions) state.transactions = [];
    const idx = state.transactions.findIndex(x => x.id === rec.id);
    if (idx >= 0) state.transactions[idx] = rec; else state.transactions.unshift(rec);
    closeTxModal();
    save(); render();
    persistTransactionToCloud(rec);
    toast(editId ? "Transaction updated" : "Transaction created");
  }
  function txAdvance(id) {
    if (!txCanManage()) { toast("Transactions shared with agents are read-only", "err"); return; }
    const t = transactionScope().find(x => x.id === id);
    if (!t) return;
    const i = TX_STAGE_ORDER.indexOf(t.stage);
    if (i < 0 || i >= TX_STAGE_ORDER.length - 1) { toast("Transaction already completed", "err"); return; }
    const next = TX_STAGE_ORDER[i + 1];
    const prevLabel = txStageCfg(t.stage).label;
    t.stage = next;
    t.updatedAt = new Date().toISOString();
    if (next === "cts" && !t.ctsDate) t.ctsDate = new Date().toISOString().slice(0, 10);
    if (next === "doas" && !t.doasDate) t.doasDate = new Date().toISOString().slice(0, 10);
    save(); render();
    persistTransactionToCloud(t);
    toast("Transaction → <b>" + esc(txStageCfg(next).label) + "</b> (" + esc(prevLabel) + " completed)");
  }
  function txDelete(id) {
    if (!txCanManage()) { toast("Transactions shared with agents are read-only", "err"); return; }
    const t = transactionScope().find(x => x.id === id);
    if (!t) return;
    if (!confirm('Delete transaction "' + (t.title || "") + '"?')) return;
    state.transactions = state.transactions.filter(x => x.id !== id);
    state.docVault = (state.docVault || []).filter(d => !(d.ownerType === "tx" && d.ownerId === id));
    if (state.commission && state.commission.payouts) {
      state.commission.payouts = state.commission.payouts.filter(p => p.transactionId !== id);
    }
    save(); render(); toast("Transaction deleted", "err");
    deleteTransactionFromCloud(id);
  }
  function txToggleCheck(id, key) {
    if (!txCanManage()) return;
    const t = transactionScope().find(x => x.id === id);
    if (!t) return;
    t.checklist = t.checklist || [];
    const i = t.checklist.indexOf(key);
    if (i >= 0) t.checklist.splice(i, 1); else t.checklist.push(key);
    t.updatedAt = new Date().toISOString();
    save();
    persistTransactionToCloud(t);
  }
  let txHooked = false;
  function bindTransactions() {
    if (!txHooked) {
      txHooked = true;
      document.addEventListener("click", e => {
        const pr = e.target.closest("[data-tx-print]");
        if (pr) { e.stopPropagation(); printTransaction(pr.getAttribute("data-tx-print")); return; }
        const gol = e.target.closest("[data-tx-goto-listing]");
        if (gol) { state.listingDetail = gol.getAttribute("data-tx-goto-listing"); state.view = "listings"; lsStatBump(state.listingDetail, "views"); lsCarIndex = 0; save(); render(); return; }
        const open = e.target.closest("[data-tx-open]");
        if (open) { state.txDetail = open.getAttribute("data-tx-open"); save(); render(); return; }
        const back = e.target.closest("[data-tx-back]");
        if (back) { state.txDetail = null; save(); render(); return; }
        const nw = e.target.closest("[data-tx-new]");
        if (nw) { openTxEditor(); return; }
        const ed = e.target.closest("[data-tx-edit]");
        if (ed) { openTxEditor(ed.getAttribute("data-tx-edit")); return; }
        const adv = e.target.closest("[data-tx-advance]");
        if (adv) { txAdvance(adv.getAttribute("data-tx-advance")); return; }
        const del = e.target.closest("[data-tx-del]");
        if (del) { txDelete(del.getAttribute("data-tx-del")); return; }
        const sv = e.target.closest("[data-tx-save]");
        if (sv) { txSaveForm(); return; }
        const cc = e.target.closest("[data-tx-cancel]");
        if (cc) { closeTxModal(); return; }
        const vl = e.target.closest("[data-tx-vault]");
        if (vl) { openVault("tx", vl.getAttribute("data-tx-vault"), "Transaction Documents"); return; }
      });
      document.addEventListener("change", e => {
        const ch = e.target.closest("[data-tx-chk]");
        if (ch) txToggleCheck(ch.getAttribute("data-tx-chk"), ch.getAttribute("data-chk-key"));
      });
    }
  }

  /* ================= COMMISSION + BROKERAGE ADMIN ================= */
  function brokerageTransactions() { return transactionScope(); }
  function brokerageLeads() { return roleIs("broker") ? leadScope() : (state.leads || []); }
  function brokerageListings() {
    return state.listings || [];
  }
  function brokeragePayouts() {
    const ids = brokerageTransactions().map(t => t.id);
    return (state.commission.payouts || []).filter(p => ids.indexOf(p.transactionId) >= 0);
  }
  function commissionSettings() { return state.commission.settings || { grossPct: 3, brokerShare: 40, agentShare: 50, referralShare: 10 }; }
  function commissionFor(t) {
    const s = commissionSettings();
    const gross = C.num(t.price, 0) * s.grossPct / 100;
    const brokerAmt = gross * s.brokerShare / 100;
    const agentAmt = gross * s.agentShare / 100;
    const referralAmt = t.referralName ? gross * s.referralShare / 100 : 0;
    return { gross: gross, brokerAmt: brokerAmt, agentAmt: agentAmt, referralAmt: referralAmt, settings: s };
  }
  function closedTransactions() { return brokerageTransactions().filter(t => t.stage === "doas" || t.stage === "done"); }
  function payoutMark(id, status) {
    if (!can("payout.approve")) { toast("You don't have permission to approve payouts", "err"); return; }
    const p = brokeragePayouts().find(x => x.transactionId === id);
    if (p) { p.status = status; if (status === "paid") p.paidAt = new Date().toISOString(); }
    save(); render(); toast(status === "paid" ? "Commission marked paid" : "Commission marked pending");
  }
  function ensurePayout(t) {
    if (t.stage !== "doas" && t.stage !== "done") return;
    if (!state.commission.payouts) state.commission.payouts = [];
    if (!state.commission.payouts.find(x => x.transactionId === t.id)) {
      state.commission.payouts.push({ transactionId: t.id, status: "pending", createdAt: new Date().toISOString() });
    }
  }
  function adminTabAllowed(tab) {
    const capability = { overview: "brokerage.view", commission: "commission.manage", payouts: "payout.approve", analytics: "brokerage.view", cobroke: "brokerage.view", inventory: "inventory.view" };
    return can(capability[tab] || "brokerage.view");
  }
  function adminCobroke() {
    loadCobroke();
    const me = currentUser ? currentUser.id : "";
    const myEmail = currentUser ? String(currentUser.email || "").toLowerCase() : "";
    const rows = Array.isArray(state.cobrokeAgreements) ? state.cobrokeAgreements.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))) : [];
    const canPropose = roleIs("super-admin") || roleIs("broker");
    let html = '<div class="card card-pad mb-24"><div class="row spread"><h3>Co-Broking Agreements</h3>' +
      (canPropose ? '<button class="btn btn-primary btn-sm" data-cb-new>' + icon("plus", 14) + " New Agreement</button>" : "") + "</div>" +
      '<p class="dim tiny mt-8">Share a listing with another licensed broker at an agreed commission split. Standard PH practice is 50 / 50 between listing and selling brokers.</p></div>';
    const pending = rows.filter(r => r.status === "proposed" && (r.selling_broker_id === me || (r.partner_email || "").toLowerCase() === myEmail) && String(r.listing_broker_id) !== String(me));
    if (pending.length) {
      html += '<div class="notice-banner mb-16"><span><b>' + pending.length + ' invitation' + (pending.length === 1 ? "" : "s") + " waiting for your response.</b></span></div>";
      html += '<div class="card card-pad mb-24"><h3 class="mb-16">Incoming Proposals</h3><div class="table-wrap"><table class="data"><tr><th>Listing</th><th>From</th><th class="num">Your Split</th><th>Notes</th><th>Actions</th></tr>';
      pending.forEach(r => {
        html += '<tr><td><b>' + esc(cbListingTitle(r.listing_id)) + "</b></td><td>" + esc(cbPartnerName(r.listing_broker_id, r.partner_email)) + '</td><td class="num"><b>' + Number(r.split_selling_pct) + "%</b></td><td>" + esc(r.notes || "-") + '</td><td><div class="row" style="gap:6px">' +
          '<button class="btn btn-primary btn-sm" data-cb-accept="' + esc(r.id) + '">Accept</button>' +
          '<button class="btn btn-danger btn-sm" data-cb-decline="' + esc(r.id) + '">Decline</button></div></td></tr>';
      });
      html += "</table></div></div>";
    }
    html += '<div class="card card-pad"><h3 class="mb-16">All Agreements</h3>';
    if (!rows.length) {
      html += '<p class="dim">No co-broking agreements yet. Propose one from a published listing to another broker.</p>';
    } else {
      html += '<div class="table-wrap"><table class="data"><tr><th>Listing</th><th>Counterparty</th><th>Your Side</th><th class="num">Your %</th><th>Status</th><th>Actions</th></tr>';
      rows.forEach(r => {
        const iAmOwner = String(r.listing_broker_id) === String(me);
        const counterparty = iAmOwner ? cbPartnerName(r.selling_broker_id, r.partner_email) : cbPartnerName(r.listing_broker_id, "");
        const myPct = iAmOwner ? r.split_listing_pct : r.split_selling_pct;
        const side = iAmOwner ? "Listing broker" : "Selling broker";
        const m = { proposed: ["Proposed", "gold"], accepted: ["Accepted", "green"], declined: ["Declined", "red"], completed: ["Completed", "purple"], cancelled: ["Cancelled", "red"] };
        const c = m[r.status] || [r.status, "blue"];
        html += '<tr><td><b>' + esc(cbListingTitle(r.listing_id)) + "</b></td><td>" + esc(counterparty) + "</td><td>" + esc(side) + '</td><td class="num">' + Number(myPct) + '%</td><td><span class="badge ' + c[1] + '">' + esc(c[0]) + "</span></td><td><div class=\"row\" style=\"gap:6px\">";
        if (r.status === "accepted") html += '<button class="btn btn-primary btn-sm" data-cb-complete="' + esc(r.id) + '">Mark Completed</button>';
        if (r.status === "proposed" && iAmOwner) html += '<button class="btn btn-danger btn-sm" data-cb-cancel="' + esc(r.id) + '">Cancel</button>';
        html += "</div></td></tr>";
      });
      html += "</table></div>";
    }
    html += "</div>";
    return html;
  }
  function cbListingTitle(listingId) {
    const l = brokerageListings().find(x => x.id === listingId);
    return (l && l.title) || listingId;
  }
  function cbPartnerName(uid, emailFallback) {
    if (uid) {
      const u = remoteProfiles.find(p => p.id === uid) || (state.users || []).find(x => x.authUserId === uid);
      if (u) return u.full_name || u.name || emailFallback || "Broker";
      const cached = (state.cobrokePartners || []).find(p => p.user_id === uid);
      if (cached) return cached.full_name;
    }
    return emailFallback || "Broker";
  }
  async function loadCobroke(force) {
    const key = currentUser ? (currentUser.id || currentUser.email) : "";
    if (!force && state.cobrokeLoadedFor === key) return;
    state.cobrokeLoadedFor = key;
    if (!SB || !currentUser || !currentUser.id || currentUser.demo) {
      seedCobrokeSample();
      render();
      return;
    }
    try {
      const r = await SB.from("cobroke_agreements").select("*").order("created_at", { ascending: false });
      if (r.error) throw r.error;
      state.cobrokeAgreements = r.data || [];
      try {
        const p = await SB.rpc("list_cobroke_partners");
        if (!p.error && p.data) state.cobrokePartners = p.data;
      } catch (e2) {}
      save(); render();
    } catch (e) { toast("Could not load co-broking agreements: " + esc(friendlyErr(e.message)), "err"); }
  }
  function seedCobrokeSample() {
    if (Array.isArray(state.cobrokeAgreements) && state.cobrokeAgreements.length) return;
    ensureListings();
    const anyListing = brokerageListings()[0];
    state.cobrokeAgreements = [
      { id: "cb-seed-1", listing_id: anyListing ? anyListing.id : "seed-listing", listing_broker_id: "user-other-broker", partner_email: currentUser ? currentUser.email : "", selling_broker_id: null, split_listing_pct: 50, split_selling_pct: 50, status: "proposed", notes: "Buyer relocating next month - quick close preferred.", created_at: new Date(Date.now() - 86400000).toISOString() },
      { id: "cb-seed-2", listing_id: anyListing ? anyListing.id : "seed-listing", listing_broker_id: currentUser ? currentUser.id : "me", partner_email: "partner@esrealty.ph", selling_broker_id: null, split_listing_pct: 40, split_selling_pct: 60, status: "accepted", notes: "", created_at: new Date(Date.now() - 5 * 86400000).toISOString() }
    ];
  }
  function openCobrokeModal() {
    closeCbModal();
    let listings = brokerageListings().filter(l => l.isPublished !== false);
    if (!listings.length) {
      const isDemo = !SB || !currentUser || !currentUser.id || currentUser.demo;
      if (isDemo) {
        ensureListings();
        state.listings.push({ id: "lst-cb-demo-1", title: "3BR House and Lot - BF Homes", price: 8500000, city: "Para\u00f1aque", isPublished: true });
        state.listings.push({ id: "lst-cb-demo-2", title: "Studio Condo - Ortigas", price: 3200000, city: "Pasig", isPublished: true });
        save();
        listings = brokerageListings();
      }
    }
    const partners = Array.isArray(state.cobrokePartners) ? state.cobrokePartners : [];
    const ov = document.createElement("div");
    ov.className = "modal-overlay"; ov.id = "cb-modal";
    ov.innerHTML = '<div class="modal-card"><div class="modal-head"><h3>New Co-Broking Agreement</h3><button class="icon-btn" data-cb-cancel>&times;</button></div><div class="modal-body">' +
      '<label class="field"><span>Listing *</span><select class="input" id="cbf-listing">' + listings.map(l => '<option value="' + esc(l.id) + '">' + esc(l.title || l.ref || l.id) + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>Partner broker *</span><select class="input" id="cbf-partner">' + partners.map(p => '<option value="' + esc(p.email || "") + '" data-pid="' + esc(p.user_id || "") + '">' + esc((p.full_name || p.email) + (p.agency ? " · " + p.agency : "") + " (" + p.role + ")") + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>Or partner email (if not listed)</span><input class="input" id="cbf-email" type="email" placeholder="broker@email.com"></label>' +
      '<div class="grid grid-2">' +
      '<label class="field"><span>Listing broker % *</span><input class="input input-num" id="cbf-lpct" type="number" min="0" max="100" value="50"></label>' +
      '<label class="field"><span>Selling broker % *</span><input class="input input-num" id="cbf-spct" type="number" min="0" max="100" value="50"></label></div>' +
      '<label class="field"><span>Notes</span><textarea class="input" id="cbf-notes" rows="2" placeholder="Deal context, timeline..."></textarea></label>' +
      "</div><div class=\"modal-foot\"><button class=\"btn btn-ghost\" data-cb-cancel>Cancel</button><button class=\"btn btn-primary\" data-cb-propose>Send Proposal</button></div></div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", ev => { if (ev.target === ov) closeCbModal(); });
    const lp = document.getElementById("cbf-lpct");
    const sp = document.getElementById("cbf-spct");
    lp.addEventListener("input", () => { sp.value = Math.max(0, Math.min(100, 100 - (Number(lp.value) || 0))); });
    sp.addEventListener("input", () => { lp.value = Math.max(0, Math.min(100, 100 - (Number(sp.value) || 0))); });
  }
  function closeCbModal() { const m = document.getElementById("cb-modal"); if (m) m.remove(); }
  async function proposeCobroke() {
    const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const listingId = g("cbf-listing");
    const partnerSel = document.getElementById("cbf-partner");
    const partnerOption = partnerSel ? partnerSel.options[partnerSel.selectedIndex] : null;
    const partnerId = partnerOption ? partnerOption.getAttribute("data-pid") : "";
    const email = g("cbf-email") || (partnerOption ? partnerOption.getAttribute("value") : "") || g("cbf-partner");
    const lp = Number(g("cbf-lpct"));
    const sp = Number(g("cbf-spct"));
    if (!listingId) { toast("Choose a listing first", "err"); return; }
    if (!email) { toast("Pick a partner broker or enter their email", "err"); return; }
    if (!(lp >= 0 && lp <= 100) || !(sp >= 0 && sp <= 100) || lp + sp !== 100) { toast("Split must total exactly 100%", "err"); return; }
    closeCbModal();
    const rec = { listing_id: listingId, listing_broker_id: currentUser.id, partner_email: email.toLowerCase(), split_listing_pct: lp, split_selling_pct: sp, status: "proposed", notes: g("cbf-notes"), responded_at: null, completed_at: null };
    const local = Object.assign({ id: "cb-" + Date.now(), selling_broker_id: partnerId || null }, rec);
    state.cobrokeAgreements.unshift(local);
    save(); render();
    if (psCloud()) {
      delete local.id; delete local.selling_broker_id;
      const r = await SB.from("cobroke_agreements").insert(rec).select("*").single();
      if (r.error) toast("Cloud save failed: " + esc(friendlyErr(r.error.message)), "err");
      else Object.assign(local, r.data);
    }
    toast("Co-broke proposal sent");
  }
  async function setCobrokeStatus(id, status) {
    const r = (state.cobrokeAgreements || []).find(x => x.id === id);
    if (!r) return;
    r.status = status;
    if (status === "completed") r.completed_at = new Date().toISOString();
    if (status === "accepted" || status === "declined") r.responded_at = new Date().toISOString();
    save(); render();
    if (psCloud()) {
      const patch = { status: status };
      if (status === "completed") patch.completed_at = r.completed_at;
      if (status !== "proposed") patch.responded_at = r.responded_at;
      const res = await SB.from("cobroke_agreements").update(patch).eq("id", id);
      if (res.error) toast("Cloud update failed: " + esc(friendlyErr(res.error.message)), "err");
    }
  }

  function renderAdmin() {
    if (!canBroker()) return '<div class="hero"><div><h1>Brokerage</h1></div></div><div class="card card-pad empty">' + icon("shield", 40) + "<h3>Brokers / admins only</h3><p>Commission, payouts, analytics, and inventory are restricted to brokerage roles.</p></div>";
    const tabs = [["overview", "Overview"], ["commission", "Commission"], ["payouts", "Payouts"], ["analytics", "Analytics"], ["cobroke", "Co-Broke"], ["inventory", "Inventory"]].filter(x => adminTabAllowed(x[0]));
    const tab = adminTabAllowed(state.adminTab) ? state.adminTab : "overview";
    if (state.adminTab !== tab) state.adminTab = tab;
    let html = '<div class="hero"><div><h1>Brokerage</h1><p>Commission management, payouts, team performance, and developer inventory.</p></div>' +
      '<div class="actions"><button class="btn btn-ghost btn-sm" data-tl-toggle>' + icon("moon", 14) + (lang === "fil" ? " English" : " Filipino") + "</button></div></div>";
    if (roleIs("broker")) html += '<div class="notice-banner">' + icon("shield", 14) + '<span><b>Private brokerage workspace:</b> transactions, commissions, payouts, and team leads belong to ' + esc((currentUser && currentUser.name) || "this broker") + '. Listings and Inventory use the shared catalog.</span></div>';
    html += '<div class="tabs-row mb-16">' + tabs.map(x => '<button class="tab-btn' + (tab === x[0] ? " on" : "") + '" data-admin-tab="' + x[0] + '">' + x[1] + "</button>").join("") + "</div>";
    html += '<div id="admin-body">' + (tab === "overview" ? adminOverview() : tab === "commission" ? adminCommission() : tab === "payouts" ? adminPayouts() : tab === "cobroke" ? adminCobroke() : tab === "analytics" ? adminAnalytics() : tab === "inventory" ? adminInventory() : "") + "</div>";
    return html;
  }
  function adminOverview() {
    const closed = closedTransactions();
    const transactions = brokerageTransactions();
    const active = transactions.filter(t => t.stage !== "done");
    const openLeads = brokerageLeads().filter(l => l.status !== "lost" && l.status !== "closed").length;
    const totalCommission = closed.reduce((s, t) => s + commissionFor(t).gross, 0);
    const pendingPayout = brokeragePayouts().filter(p => p.status !== "paid").reduce((s, p) => { const t = transactions.find(x => x.id === p.transactionId); return s + (t ? commissionFor(t).gross : 0); }, 0);
    let html = '<div class="ls-stat-row">' +
      lsStat("Active transactions", active.length) + lsStat("Closed deals", closed.length) +
      lsStat("Open leads", openLeads) + lsStat("Total commissions (closed)", C.money(totalCommission)) +
      lsStat("Pending payout", C.money(pendingPayout)) + "</div>";
    html += '<div class="card card-pad mt-16"><h3>Sales Pipeline</h3><div class="table-wrap mt-8"><table class="data"><thead><tr><th>Stage</th><th>Count</th><th>Value (₱)</th></tr></thead><tbody>' +
      TX_STAGES.map(s => { const arr = transactions.filter(t => t.stage === s.value); return "<tr><td>" + txStatusBadge(s.value) + "</td><td>" + arr.length + "</td><td>" + C.money(arr.reduce((x, t) => x + C.num(t.price, 0), 0)) + "</td></tr>"; }).join("") +
      "</tbody></table></div></div>";
    return html;
  }
  function adminCommission() {
    const s = commissionSettings();
    const rows = closedTransactions().map(t => { const c = commissionFor(t); return { t: t, c: c }; });
    let html = '<div class="card card-pad mb-24"><h3>Commission Settings</h3><p class="dim mt-8">Splits are applied automatically to every closed deal (DOAS / Completed).</p><div class="grid grid-3 mt-8">' +
      '<div class="field"><label>Gross commission (%)</label><input class="input input-num" id="com-gross" type="text" inputmode="decimal" value="' + s.grossPct + '"></div>' +
      '<div class="field"><label>Broker share (%)</label><input class="input input-num" id="com-broker" type="text" inputmode="decimal" value="' + s.brokerShare + '"></div>' +
      '<div class="field"><label>Agent share (%)</label><input class="input input-num" id="com-agent" type="text" inputmode="decimal" value="' + s.agentShare + '"></div>' +
      '<div class="field"><label>Referral share (%)</label><input class="input input-num" id="com-referral" type="text" inputmode="decimal" value="' + s.referralShare + '"></div>' +
      "</div><button class='btn btn-primary mt-8' data-com-save>" + icon("check", 15) + " Save Settings</button></div>";
    html += '<div class="card card-pad"><h3>Commission Register</h3>' + (rows.length ?
      '<div class="table-wrap mt-8"><table class="data"><thead><tr><th>Transaction</th><th>Price</th><th>Gross (₱)</th><th>Broker (₱)</th><th>Agent (₱)</th><th>Referral (₱)</th><th>Status</th></tr></thead><tbody>' +
      rows.map(r => { const p = brokeragePayouts().find(x => x.transactionId === r.t.id); return "<tr><td>" + esc(r.t.title || r.t.ref) + "</td><td>" + C.money(r.t.price) + "</td><td>" + C.money(r.c.gross) + "</td><td>" + C.money(r.c.brokerAmt) + "</td><td>" + C.money(r.c.agentAmt) + "</td><td>" + C.money(r.c.referralAmt) + "</td><td>" + (p && p.status === "paid" ? '<span class="badge green">Paid</span>' : '<span class="badge gold">Pending</span>') + "</td></tr>"; }).join("") +
      "</tbody></table></div>" : '<div class="dim mt-8">No closed deals yet — commissions appear automatically once a transaction reaches DOAS or Completed.</div>') + "</div>";
    return html;
  }
  function adminPayouts() {
    ensurePayoutAll();
    const transactions = brokerageTransactions();
    const payouts = brokeragePayouts().slice().reverse();
    let html = '<div class="card card-pad"><h3>Payout History</h3>' + (payouts.length ?
      '<div class="table-wrap mt-8"><table class="data"><thead><tr><th>Transaction</th><th>Gross commission</th><th>Status</th><th>Mark</th></tr></thead><tbody>' +
      payouts.map(p => { const t = transactions.find(x => x.id === p.transactionId); const c = t ? commissionFor(t) : { gross: 0 }; return "<tr><td>" + esc((t && t.title) || p.transactionId) + "</td><td>" + C.money(c.gross) + "</td><td>" + (p.status === "paid" ? '<span class="badge green">Paid' + (p.paidAt ? " · " + new Date(p.paidAt).toLocaleDateString() : "") + "</span>" : '<span class="badge gold">Pending</span>') + "</td><td>" +
        (p.status === "paid" ? '<button class="btn btn-ghost btn-sm" data-payout="' + esc(p.transactionId) + '" data-payout-status="pending">Revert</button>' : '<button class="btn btn-primary btn-sm" data-payout="' + esc(p.transactionId) + '" data-payout-status="paid">Mark paid</button>') + "</td></tr>"; }).join("") +
      "</tbody></table></div>" : '<div class="dim mt-8">No payouts yet.</div>') + "</div>";
    return html;
  }
  function ensurePayoutAll() {
    brokerageTransactions().forEach(t => ensurePayout(t));
  }
  async function loadTeamPerformance() {
    if (state.teamPerformanceLoaded) return;
    state.teamPerformanceLoaded = true;
    if (!SB || !currentUser || currentUser.demo) {
      state.teamPerformance = [
        { full_name: "Marco Villanueva", role: "broker", leads_total: 42, leads_open: 11, leads_closed: 9, deals_closed: 6, sales_volume: 47800000, listings_active: 7 },
        { full_name: "Angel Santos", role: "agent", leads_total: 31, leads_open: 14, leads_closed: 5, deals_closed: 3, sales_volume: 18900000, listings_active: 4 },
        { full_name: "Rina Lopez", role: "agent", leads_total: 24, leads_open: 16, leads_closed: 2, deals_closed: 1, sales_volume: 6400000, listings_active: 3 }
      ];
      return;
    }
    try {
      const r = await SB.rpc("team_performance");
      if (r.error) throw r.error;
      state.teamPerformance = r.data || [];
      render();
    } catch (e) { toast("Could not load team performance: " + esc(friendlyErr(e.message)), "err"); }
  }
  function teamPerfCard() {
    const rows = Array.isArray(state.teamPerformance) ? state.teamPerformance.slice().sort((a, b) => Number(b.sales_volume || 0) - Number(a.sales_volume || 0)) : [];
    let card = '<div class="card card-pad mb-24"><div class="row spread"><h3>Team Performance</h3>' +
      '<button class="btn btn-ghost btn-sm" data-tperf-refresh>' + icon("back", 13) + " Refresh</button></div>";
    if (!rows.length) {
      card += '<p class="dim">No team data available yet. Performance builds as agents are assigned leads and close transactions.</p>';
    } else {
      card += '<div class="table-wrap"><table class="data"><tr><th>#</th><th>Agent</th><th>Role</th><th class="num">Leads</th><th class="num">Closed Leads</th><th class="num">Conv %</th><th class="num">Deals</th><th class="num">Sales Volume</th><th class="num">Active Listings</th></tr>';
      rows.forEach((r, i) => {
        const conv = r.leads_total ? Math.round((Number(r.leads_closed) / Number(r.leads_total)) * 100) + "%" : "-";
        card += "<tr><td>" + (i + 1) + "</td><td><b>" + esc(r.full_name || "-") + '</b></td><td><span class="badge ' + (r.role === "broker" ? "purple" : "blue") + '">' + esc(r.role) + "</span></td>" +
          '<td class="num">' + esc(String(r.leads_total)) + '</td><td class="num">' + esc(String(r.leads_closed)) + '</td><td class="num">' + conv + '</td><td class="num">' + esc(String(r.deals_closed)) + '</td><td class="num"><b>' + C.money(Number(r.sales_volume || 0)) + '</b></td><td class="num">' + esc(String(r.listings_active)) + "</td></tr>";
      });
      card += "</table></div>";
    }
    card += "</div>";
    return card;
  }

  function adminAnalytics() {
    loadTeamPerformance();
    const stats = state.listingStats || {};
    const listings = brokerageListings();
    const listingIds = listings.map(l => l.id);
    const views = Object.keys(stats).filter(k => listingIds.indexOf(k) >= 0).reduce((s, k) => s + (stats[k].views || 0), 0);
    const inquiries = Object.keys(stats).filter(k => listingIds.indexOf(k) >= 0).reduce((s, k) => s + (stats[k].inquiries || 0), 0);
    const topListings = listings.slice().sort((a, b) => ((stats[b.id] && stats[b.id].views) || 0) - ((stats[a.id] && stats[a.id].views) || 0)).slice(0, 5);
    const agents = {};
    closedTransactions().forEach(t => { if (t.agentName) { agents[t.agentName] = agents[t.agentName] || { deals: 0, commission: 0 }; agents[t.agentName].deals++; agents[t.agentName].commission += commissionFor(t).gross; } });
    const leaderboard = Object.keys(agents).sort((a, b) => agents[b].commission - agents[a].commission);
    let html = '<div class="ls-stat-row">' + lsStat("Listing views", views) + lsStat("Inquiries", inquiries) + lsStat("Conversion (inquiries→closed)", inquiries ? Math.round(closedTransactions().length / inquiries * 100) + "%" : "—") + "</div>";
    html += '<div class="grid grid-2 mt-16">';
    html += '<div class="card card-pad"><h3>Agent Leaderboard (closed deals)</h3>' + (leaderboard.length ?
      '<div class="table-wrap mt-8"><table class="data"><thead><tr><th>#</th><th>Agent</th><th>Deals</th><th>Commission</th></tr></thead><tbody>' +
      leaderboard.map((a, i) => "<tr><td>" + (i + 1) + "</td><td>" + esc(a) + "</td><td>" + agents[a].deals + "</td><td>" + C.money(agents[a].commission) + "</td></tr>").join("") +
      "</tbody></table></div>" : '<div class="dim mt-8">No closed deals yet.</div>') + "</div>";
    html += '<div class="card card-pad"><h3>Top Listings by Views</h3>' + (topListings.length ?
      '<div class="table-wrap mt-8"><table class="data"><thead><tr><th>Listing</th><th>Views</th><th>Inquiries</th></tr></thead><tbody>' +
      topListings.map(l => "<tr><td>" + esc(l.title) + "</td><td>" + (stats[l.id] ? stats[l.id].views || 0 : 0) + "</td><td>" + (stats[l.id] ? stats[l.id].inquiries || 0 : 0) + "</td></tr>").join("") +
      "</tbody></table></div>" : '<div class="dim mt-8">No views recorded yet.</div>') + "</div>";
    html += "</div>";
    html = teamPerfCard() + html;
    return html;
  }
  function adminInventory() {
    const byDev = {};
    brokerageListings().forEach(l => {
      const key = (l.developer || l.agentName || "Brokerage inventory").trim();
      byDev[key] = byDev[key] || {};
      byDev[key][l.status || "available"] = (byDev[key][l.status || "available"] || 0) + 1;
    });
    const statuses = ["available", "reserved", "sold", "rfo", "pre-selling"];
    const labels = { available: "Available", reserved: "Reserved", sold: "Sold", rfo: "RFO", "pre-selling": "Pre-Selling" };
    const devs = Object.keys(byDev);
    const synced = state.invLastSynced ? new Date(state.invLastSynced).toLocaleString() : null;
    let html = '<div class="card card-pad"><div class="inv-head">' +
      '<div><h3>Developer Inventory Report</h3><p class="dim mt-8">Live from the shared catalog — units available / reserved / sold per project or developer.</p>' +
      (synced ? '<p class="dim tiny mt-8">' + icon("check", 12) + ' Last synced: ' + synced + "</p>" : '<p class="dim tiny mt-8">' + icon("refresh", 12) + ' Opens with the latest cloud data.</p>') +
      "</div>" +
      '<button class="btn btn-ghost btn-sm" data-inv-refresh>' + icon("refresh", 13) + ' Refresh</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="__geoGo()" data-inv-geocode title="Find coordinates for listings missing them">Auto-locate</button>' +
      "</div>" +
      (devs.length ?
      '<div class="table-wrap mt-8"><table class="data"><thead><tr><th>Developer / Project</th>' + statuses.map(s => "<th>" + labels[s] + "</th>").join("") + "<th>Total</th></tr></thead><tbody>" +
      devs.map(d => { const total = statuses.reduce((s2, st) => s2 + (byDev[d][st] || 0), 0); return "<tr><td><a href=\"#\" class=\"link-btn\" data-ls-dev=\"" + esc(d) + "\">" + esc(d) + "</a></td>" + statuses.map(st => "<td>" + (byDev[d][st] || 0) + "</td>").join("") + "<td><b>" + total + "</b></td></tr>"; }).join("") +
      "</tbody></table></div>" : '<div class="dim mt-8">No listings yet.</div>') + "</div>";
    return html;
  }
  let adminInvRefreshing = false;
  async function refreshAdminInventory() {
    if (adminInvRefreshing) return;
    adminInvRefreshing = true;
    const btn = document.querySelector("[data-inv-refresh]");
    const orig = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = "Syncing…"; }
    try {
      if (SB && currentUser && currentUser.id) await loadCloudListings();
      state.invLastSynced = Date.now();
      save();
    } catch (e) {}
    adminInvRefreshing = false;
    if (state.view === "admin" && state.adminTab === "inventory") {
      const b = document.querySelector("[data-inv-refresh]");
      if (b && orig) { b.disabled = false; b.innerHTML = orig; }
      render();
    }
  }
  function adminComSave() {
    if (!can("commission.manage")) { toast("You don't have permission to edit commission settings", "err"); return; }
    const s = commissionSettings();
    const $n = id => { const el = document.getElementById(id); return el ? C.num(el.value, 0) : 0; };
    s.grossPct = $n("com-gross") || 3;
    s.brokerShare = $n("com-broker") || 0;
    s.agentShare = $n("com-agent") || 0;
    s.referralShare = $n("com-referral") || 0;
    save(); render(); toast("Commission settings saved");
  }
  let adminHooked = false;
  function bindAdmin() {
    if (!adminHooked) {
      adminHooked = true;
      document.addEventListener("click", e => {
        const tb = e.target.closest("[data-admin-tab]");
        if (tb) {
          const tab = tb.getAttribute("data-admin-tab");
          if (!adminTabAllowed(tab)) { toast("You don't have permission to view this section", "err"); return; }
          state.adminTab = tab; save(); render();
          if (tab === "inventory") refreshAdminInventory();
          return;
        }
        const invr = e.target.closest("[data-inv-refresh]");
        if (invr) { e.preventDefault(); refreshAdminInventory(); return; }
        const cs = e.target.closest("[data-com-save]");
        if (cs) { adminComSave(); return; }
        const po = e.target.closest("[data-payout]");
        if (po) { payoutMark(po.getAttribute("data-payout"), po.getAttribute("data-payout-status")); return; }
        const tl = e.target.closest("[data-tl-toggle]");
        if (tl) { toggleLang(); return; }
        const ld = e.target.closest("[data-ls-dev]");
        if (ld) {
          e.preventDefault();
          state.listingFilters = state.listingFilters || {};
          state.listingFilters.q = ld.getAttribute("data-ls-dev");
          state.listingDetail = null;
          save();
          navigate("listings");
          return;
        }
      });
    }
    if (state.view === "admin" && (state.adminTab === "overview" || state.adminTab === "payouts")) ensurePayoutAll();
    if (state.view === "admin" && state.adminTab === "inventory" && Date.now() - (state.invLastSynced || 0) > 10000) refreshAdminInventory();
  }

  /* ================= SETTINGS ================= */
  function profileDetails() {
    if (!currentUser) return {};
    const email = currentUser.email || "";
    const name = currentUser.name || (email ? email.split("@")[0] : "");
    let agency = currentUser.agency || "", prc = currentUser.prc || "", resa = currentUser.resa || "", phone = currentUser.phone || "";
    if (currentUser.demo && state.users) {
      const local = (state.users || []).find(u => String(u.email || "").toLowerCase() === String(email).toLowerCase());
      if (local) { agency = local.agency || ""; prc = local.prc || ""; resa = local.resa || ""; phone = local.phone || ""; }
    }
    return { email: email, name: name, agency: agency, prc: prc, resa: resa, phone: phone };
  }
  function renderSettings() {
    const d = profileDetails();
    const cloud = !!(SB && currentUser && currentUser.id && !currentUser.demo);
    const demo = !!(currentUser && currentUser.demo);
    const roleBadge = userBadge(userRole());
    const statusChip = currentUser && currentUser.registrationStatus
      ? '<span class="badge ' + (currentUser.registrationStatus === "approved" ? "green" : currentUser.registrationStatus === "rejected" ? "red" : "gold") + '">' + esc(currentUser.registrationStatus) + '</span>' : "";
    const fields =
      '<div class="grid grid-2">' +
      '<div class="field"><label>Full name</label><input class="input" id="st-name" type="text" value="' + esc(d.name) + '"></div>' +
      '<div class="field"><label>Email</label><input class="input" id="st-email" type="email" value="' + esc(d.email) + '"' + (cloud ? " disabled" : "") + '><div class="field-hint">' + (cloud ? "Your login email is managed by Supabase and cannot be changed here." : "Demo mode: you can edit your email.") + "</div></div>" +
      '<div class="field"><label>Phone</label><input class="input" id="st-phone" type="text" value="' + esc(d.phone) + '" placeholder="+63 ..."></div>' +
      (userRole() === "owner" ? "" :
      '<div class="field"><label>Agency / company</label><input class="input" id="st-agency" type="text" value="' + esc(d.agency) + '" placeholder="e.g. Villanueva & Co."></div>' +
      '<div class="field"><label>PRC license no. (brokers)</label><input class="input" id="st-prc" type="text" value="' + esc(d.prc) + '" placeholder="12-digit PRC license"><div class="field-hint">Required for brokers per RA 9646.</div></div>' +
      '<div class="field"><label>RESA accreditation no. (brokers)</label><input class="input" id="st-resa" type="text" value="' + esc(d.resa) + '" placeholder="e.g. RESA-2024-0881"></div>') +
      "</div>";
    let html = '<div class="hero"><div><h1>Settings</h1><p>Edit your profile details.</p></div></div>';
    if (currentUser && currentUser.mustChangePassword) html += '<div class="notice-banner password-required">' + icon("shield", 22) + '<div><strong>Password change required.</strong><span>Your password was reset by an administrator. Change the temporary password below before continuing.</span></div></div>';
    html += '<div class="user-card card card-pad"><div class="row" style="gap:12px;align-items:flex-start">' + leadAvatar(d.name, 44) +
      '<div class="grow"><div class="lead-card-name">' + esc(d.name || d.email) + '</div><div class="dim tiny">' + esc(d.email || "") + '</div>' +
      '<div class="row mt-8" style="gap:6px;flex-wrap:wrap">' + roleBadge + statusChip +
      (cloud && roleIs("super-admin") ? '<span class="chip">Live Supabase</span>' : demo ? '<span class="chip">Demo data</span>' : "") + "</div></div></div>";
    html += '<div class="card card-pad mt-16"><h3>Profile</h3>' + fields +
      '<div class="row mt-16" style="gap:8px"><button class="btn btn-primary" data-settings-save>' + icon("check", 15) + " Save Profile</button></div></div>";
    html += '<div class="card card-pad mt-16"><h3>Change password</h3><p class="dim">' + (cloud ? "Your login password is stored securely by Supabase." : "Demo mode: this updates the local demo password.") + '</p>' +
      '<div class="grid grid-2 mt-8">' +
      '<div class="field"><label>Current password</label><input class="input" id="st-pass-cur" type="password" autocomplete="current-password"></div>' +
      '<div class="field"><label>New password</label><input class="input" id="st-pass-new" type="password" autocomplete="new-password"><div class="field-hint">At least 6 characters.</div></div>' +
      '<div class="field"><label>Confirm new password</label><input class="input" id="st-pass-conf" type="password" autocomplete="new-password"></div>' +
      "</div>" +
      '<div class="row mt-16" style="gap:8px"><button class="btn btn-primary" data-settings-pass>' + icon("key", 15) + " Change Password</button></div></div>";
    return html;
  }
  function settingsChangePassword() {
    const $v = id => { const el = document.getElementById(id); return el ? el.value : ""; };
    const cur = $v("st-pass-cur"), nw = $v("st-pass-new"), cf = $v("st-pass-conf");
    if (!cur) { toast("Enter your current password", "err"); return; }
    if (!nw || nw.length < 6) { toast("New password must be at least 6 characters", "err"); return; }
    if (nw !== cf) { toast("New passwords do not match", "err"); return; }
    const cloud = !!(SB && currentUser && currentUser.id && !currentUser.demo);
    const clearFields = () => ["st-pass-cur", "st-pass-new", "st-pass-conf"].forEach(i => { const el = document.getElementById(i); if (el) el.value = ""; });
    if (cloud) {
      const update = async () => {
        const v = await SB.auth.signInWithPassword({ email: currentUser.email, password: cur });
        if (v.error) {
          const low = String(v.error.message || "").toLowerCase();
          if (/invalid login credentials/.test(low)) { toast("Current password is incorrect", "err"); return; }
          toast("Could not verify current password: " + esc(v.error.message), "err");
          return;
        }
        const res = await SB.auth.updateUser({ password: nw, data: { must_change_password: false } });
        if (res.error) {
          const low = String(res.error.message || "").toLowerCase();
          if (/different|same as/.test(low)) { toast("New password must be different from your current one", "err"); return; }
          toast("Could not change password: " + esc(res.error.message), "err");
          return;
        }
        clearFields();
        currentUser.mustChangePassword = false;
        render();
        toast("Password updated successfully");
      };
      update();
      return;
    }
    const em = String(currentUser.email || "").toLowerCase();
    let users = [];
    try { users = JSON.parse(localStorage.getItem("esrealty_users") || "[]"); } catch (e) {}
    const rec = users.find(u => String(u.email || "").toLowerCase() === em);
    if (rec && rec.password && rec.password !== cur) { toast("Current password is incorrect", "err"); return; }
    if (rec) rec.password = nw; else users.push({ email: em, role: userRole(), createdAt: Date.now(), password: nw });
    localStorage.setItem("esrealty_users", JSON.stringify(users));
    clearFields();
    toast("Password updated successfully");
  }
  function settingsSaveForm() {
    const $v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const name = $v("st-name"), email = $v("st-email");
    if (!name) { toast("Full name is required", "err"); return; }
    if (!email) { toast("Email is required", "err"); return; }
    const data = { name: name, email: email, phone: $v("st-phone"), agency: $v("st-agency"), prc: $v("st-prc"), resa: $v("st-resa") };
    const cloud = !!(SB && currentUser && currentUser.id && !currentUser.demo);
    const doFinish = (msg) => { toast(msg || "Profile saved"); render(); };
    if (cloud) {
      const updateProfile = async () => {
        const payload = { full_name: data.name, agency: data.agency, prc: data.prc, resa: data.resa, phone: data.phone };
        const res = await SB.from("profiles").update(payload).eq("id", currentUser.id);
        if (res.error) {
          const low = String(res.error.message || "").toLowerCase();
          if (low.indexOf("permission denied for column") >= 0 || low.indexOf("column") >= 0 && low.indexOf("does not exist") >= 0) {
            const r1 = await SB.from("profiles").update({ full_name: data.name }).eq("id", currentUser.id);
            if (r1.error) { toast("Could not save profile: " + esc(r1.error.message), "err"); return; }
            currentUser.name = data.name;
            currentUser.phone = data.phone;
            save();
            toast("Profile saved. PRC/RESA/agency/phone need column grants — run <b>patch_profile_self_edit.sql</b> in the Supabase SQL Editor once.");
            render();
            return;
          }
          toast("Could not save profile: " + esc(res.error.message || "Unknown error"), "err");
          return;
        }
        currentUser.name = data.name;
        currentUser.agency = data.agency; currentUser.prc = data.prc; currentUser.resa = data.resa; currentUser.phone = data.phone;
        save();
        doFinish("Profile saved to Supabase");
      };
      updateProfile();
      return;
    }
    currentUser.name = data.name;
    currentUser.email = data.email;
    currentUser.phone = data.phone; currentUser.agency = data.agency; currentUser.prc = data.prc; currentUser.resa = data.resa;
    let users = [];
    try { users = JSON.parse(localStorage.getItem("esrealty_users") || "[]"); } catch (e) {}
    const em = String(data.email || "").toLowerCase();
    const rec = users.find(u => String(u.email || "").toLowerCase() === em);
    if (rec) { rec.name = data.name; rec.phone = data.phone; rec.agency = data.agency; rec.prc = data.prc; rec.resa = data.resa; }
    else users.push(Object.assign({ email: em, role: userRole(), createdAt: Date.now() }, data));
    localStorage.setItem("esrealty_users", JSON.stringify(users));
    if (state.users) {
      const su = (state.users || []).find(u => String(u.email || "").toLowerCase() === em);
      if (su) Object.assign(su, { name: data.name, phone: data.phone, agency: data.agency, prc: data.prc, resa: data.resa });
    }
    saveUser(currentUser);
    save();
    doFinish("Profile saved");
  }
  let settingsHooked = false;
  function bindSettings() {
    if (!settingsHooked) {
      settingsHooked = true;
      document.addEventListener("click", e => {
        const sv = e.target.closest("[data-settings-save]");
        if (sv) { settingsSaveForm(); return; }
        const cp = e.target.closest("[data-settings-pass]");
        if (cp) { settingsChangePassword(); return; }
      });
    }
  }

  /* ================= LISTING INQUIRY + SHARE + STATS ================= */
  function lsStatBump(id, key) {
    if (!state.listingStats) state.listingStats = {};
    state.listingStats[id] = state.listingStats[id] || { views: 0, inquiries: 0 };
    state.listingStats[id][key] = (state.listingStats[id][key] || 0) + 1;
    save();
    bumpSharedListingStat(id, key);
  }
  function copyListingText(text, message) {
    const done = () => toast(message);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => toast("Could not copy text", "err"));
      return;
    }
    const field = document.createElement("textarea");
    field.value = text;
    field.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    toast(copied ? message : "Could not copy text", copied ? "" : "err");
  }
  function listingInquiryForm(l) {
    return '<div class="card card-pad mt-16" id="ls-inq"><h3>Inquire about this property</h3>' +
      '<div class="grid grid-2 mt-8">' +
      '<div class="field"><label>Full name *</label><input class="input" id="lq-name" type="text" placeholder="Juan Dela Cruz"></div>' +
      '<div class="field"><label>Mobile / phone *</label><input class="input" id="lq-phone" type="text" placeholder="+63 9xx xxx xxxx"></div>' +
      '<div class="field"><label>Email</label><input class="input" id="lq-email" type="email" placeholder="you@email.com"></div>' +
      '<div class="field"><label>I am a</label><select class="input" id="lq-type"><option value="buyer">Buyer / Client</option><option value="renter">Renter</option><option value="investor">Investor</option><option value="seller">Seller</option></select></div>' +
      '<div class="field" style="grid-column:span 2"><label>Budget / message</label><textarea class="input" id="lq-msg" rows="3" placeholder="Hi, I would like to know more about this property…"></textarea></div>' +
      "</div>" +
      '<label class="ms-chk mt-8" style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="lq-consent"> <span>I consent to ES Realty processing my contact details to respond to this inquiry, per the Data Privacy Act of 2012 (RA 10173). *</span></label>' +
      '<button class="btn btn-primary mt-8" data-ls-inquire="' + esc(l.id) + '">' + icon("mail", 15) + " Send Inquiry</button>" +
      '<div class="row mt-16" style="gap:8px">' +
      '<a class="btn btn-ghost btn-sm" href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(location.href) + '" target="_blank" rel="noopener">' + icon("share", 14) + " Facebook</a>" +
      '<a class="btn btn-ghost btn-sm" href="https://twitter.com/intent/tweet?text=' + encodeURIComponent((l.title || "") + " — " + listingDisplayPrice(l)) + '&url=' + encodeURIComponent(location.href) + '" target="_blank" rel="noopener">' + icon("share", 14) + " X/Twitter</a>" +
      '<a class="btn btn-ghost btn-sm" href="https://api.whatsapp.com/send?text=' + encodeURIComponent((l.title || "") + " " + listingDisplayPrice(l) + " " + location.href) + '" target="_blank" rel="noopener">' + icon("chat", 14) + " WhatsApp</a>" +
      '<a class="btn btn-ghost btn-sm" href="viber://forward?text=' + encodeURIComponent((l.title || "") + " " + location.href) + '" target="_blank" rel="noopener">' + icon("phone", 14) + " Viber</a>" +
      '<button class="btn btn-ghost btn-sm" data-ls-copylink>' + icon("link", 14) + " Copy Link</button>" +
      "</div>" +
      '<div class="notice-banner mt-8">' + icon("shield", 14) + ' Share to <b>Facebook Marketplace</b> using the copy button below — paste the title, price, description, and photos into your Marketplace listing.</div>' +
      '<button class="btn btn-ghost btn-sm mt-8" data-ls-mktcopy>' + icon("copy", 14) + " Copy Marketplace Post</button>" +
      "</div>";
  }
  async function submitListingInquiry(id) {
    const $v = idn => { const el = document.getElementById(idn); return el ? el.value.trim() : ""; };
    const name = $v("lq-name"), phone = $v("lq-phone");
    const consent = $("#lq-consent") ? $("#lq-consent").checked : false;
    if (!name || !phone) { toast("Name and mobile number are required", "err"); return; }
    if (!consent) { toast("Please consent to the Data Privacy Act notice to continue", "err"); return; }
    const l = (state.listings || []).find(x => x.id === id);
    if (!l) return;
    try {
      if (IS_LOCAL_DEV && !currentUser.registrationStatus) {
        toast("Demo inquiry recorded for <b>" + esc(name) + "</b>");
        return;
      }
      if (!LISTINGS_API) throw new Error("Listings API is unavailable");
      await LISTINGS_API.inquire(id, { full_name: name, phone: phone, email: $v("lq-email"), contact_type: $v("lq-type") || "buyer", message: $v("lq-msg") || "Inquiry from listing page.", consent: true });
      toast("Inquiry sent — we'll contact you within the day. <b>Thanks, " + esc(name) + "!</b>");
      render();
    } catch (e) { toast("Could not send inquiry: " + esc(friendlyErr(e.message)), "err"); }
  }
  function listingMarketCopy(l) {
    const d = l.description || "";
    const ppsm = listingPriceSqm(l);
    return (l.title || "") + "\n" + listingDisplayPrice(l) + (ppsm ? " (" + C.money(Math.round(ppsm)) + "/sqm)" : "") + "\n" + [l.barangay, l.city, l.province].filter(Boolean).join(", ") + "\n" + (l.lotArea ? "Lot: " + l.lotArea + " sqm" : "") + (l.floorArea ? " Floor: " + l.floorArea + " sqm" : "") + "\n" + (d ? d + "\n" : "") + "More: " + location.href + "\n#RealEstatePH #ForSale";
  }

  /* ================= BOOT ================= */
  document.addEventListener("DOMContentLoaded", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    state = loadState();
    currentUser = loadUser();
    if (currentUser && currentUser.role === "admin") { currentUser.role = "super-admin"; saveUser(currentUser); }
    let restoredCloud = false;
    try { if (await sbUp(10000)) { await restoreSupabaseSession(); restoredCloud = !!currentUser; } } catch (e) { toast("Cloud session could not be restored: " + esc(e.message || "Unknown error"), "err"); }
    if (!restoredCloud && !currentUser) currentUser = loadUser();
    ensureListings();
    ensureLeads();
    ensureBrokerage();
    bindGlobal();
    bindAuth();
    bindAuthState();
    bindNotifications();
    render();
  });
})();
