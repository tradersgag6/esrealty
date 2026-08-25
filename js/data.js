/* ============================================================
   ES Realty — Static Data (Philippines)
   Regions → provinces → representative cities, market benchmarks,
   construction cost tables, and amenities.
   ============================================================ */
(function () {
  "use strict";

  // Region → provinces (used for cascading province→city dropdowns)
  const PH_REGIONS = [
    ["NCR", ["Metro Manila"], { ncr: ["Manila", "Quezon City", "Makati", "Taguig", "Pasig", "Mandaluyong", "Parañaque", "Muntinlupa", "Caloocan", "Las Piñas", "Pasay", "Marikina", "San Juan", "Valenzuela", "Malabon", "Navotas", "Pateros"] }],
    ["Region I (Ilocos)", ["Ilocos Norte", "Ilocos Sur", "La Union", "Pangasinan"], {}],
    ["Region II (Cagayan Valley)", ["Batanes", "Cagayan", "Isabela", "Nueva Vizcaya", "Quirino"], {}],
    ["Region III (Central Luzon)", ["Aurora", "Bataan", "Bulacan", "Nueva Ecija", "Pampanga", "Tarlac", "Zambales"], { bulacan: ["Meycauayan", "Malolos", "Santa Maria", "San Jose del Monte"], pampanga: ["Angeles", "San Fernando", "Mabalacat"], bataan: ["Mariveles", "Balanga"] }],
    ["Region IV-A (CALABARZON)", ["Batangas", "Cavite", "Laguna", "Quezon", "Rizal"], { cavite: ["Imus", "Bacoor", "Dasmariñas", "General Trias", "Trece Martires", "Silang", "Tagaytay"], laguna: ["Santa Rosa", "Biñan", "Calamba", "San Pedro", "Cabuyao"], batangas: ["Batangas City", "Lipa", "Tanauan"], rizal: ["Antipolo", "Taytay", "Cainta"] }],
    ["Region IV-B (MIMAROPA)", ["Marinduque", "Occidental Mindoro", "Oriental Mindoro", "Palawan", "Romblon"], { palawan: ["Puerto Princesa", "Coron"] }],
    ["Region V (Bicol)", ["Albay", "Camarines Norte", "Camarines Sur", "Catanduanes", "Masbate", "Sorsogon"], { albay: ["Legazpi", "Tabaco"], "camarines sur": ["Naga", "Iriga"] }],
    ["Region VI (Western Visayas)", ["Aklan", "Antique", "Capiz", "Guimaras", "Iloilo", "Negros Occidental"], { iloilo: ["Iloilo City"], "negros occidental": ["Bacolod"] }],
    ["Region VII (Central Visayas)", ["Bohol", "Cebu", "Negros Oriental", "Siquijor"], { cebu: ["Cebu City", "Lapu-Lapu", "Mandaue", "Talisay", "Minglanilla"] }],
    ["Region VIII (Eastern Visayas)", ["Biliran", "Eastern Samar", "Leyte", "Northern Samar", "Samar", "Southern Leyte"], { leyte: ["Tacloban", "Ormoc"] }],
    ["Region IX (Zamboanga Peninsula)", ["Zamboanga del Norte", "Zamboanga del Sur", "Zamboanga Sibugay"], { "zamboanga del sur": ["Zamboanga City"] }],
    ["Region X (Northern Mindanao)", ["Bukidnon", "Camiguin", "Lanao del Norte", "Misamis Occidental", "Misamis Oriental"], { "misamis oriental": ["Cagayan de Oro"] }],
    ["Region XI (Davao)", ["Davao de Oro", "Davao del Norte", "Davao del Sur", "Davao Occidental", "Davao Oriental"], { "davao del sur": ["Davao City"] }],
    ["Region XII (SOCCSKSARGEN)", ["Cotabato", "Sarangani", "South Cotabato", "Sultan Kudarat"], { "south cotabato": ["General Santos"] }],
    ["Region XIII (Caraga)", ["Agusan del Norte", "Agusan del Sur", "Dinagat Islands", "Surigao del Norte", "Surigao del Sur"], { "agusan del norte": ["Butuan"] }],
    ["BARMM (Bangsamoro)", ["Basilan", "Lanao del Sur", "Maguindanao del Norte", "Maguindanao del Sur", "Sulu", "Tawi-Tawi"], { "lanao del sur": ["Marawi"] }],
    ["CAR (Cordillera)", ["Abra", "Apayao", "Benguet", "Ifugao", "Kalinga", "Mountain Province"], { benguet: ["Baguio"] }]
  ];

  // Complete city/municipality map: region label → province → municipalities
  // (component + highly-urbanized cities plus the principal municipalities).
  const PH_CITY_MAP = {
    "NCR": {
      "Metro Manila": ["Manila", "Quezon City", "Makati", "Taguig", "Pasig", "Mandaluyong", "Parañaque", "Muntinlupa", "Caloocan", "Las Piñas", "Pasay", "Marikina", "San Juan", "Valenzuela", "Malabon", "Navotas", "Pateros"]
    },
    "Region I (Ilocos)": {
      "Ilocos Norte": ["Laoag", "Batac", "Badoc", "Bacarra", "Paoay", "San Nicolas", "Vintar", "Currimao", "Bangui", "Burgos", "Pasuquin", "Pagudpud", "Dingras", "Sarrat", "Solsona", "Marcos", "Nueva Era", "Adams", "Carasi", "Dumalneg"],
      "Ilocos Sur": ["Vigan", "Candon", "Bantay", "Santa", "San Juan", "Magsingal", "Cabugao", "Sinait", "Caoayan", "Santa Catalina", "Santa Maria", "Narvacan", "Santiago", "Tagudin", "Suyo", "Cervantes", "Quirino", "Salcedo", "San Emilio", "Santo Domingo"],
      "La Union": ["San Fernando", "Agoo", "Bauang", "Rosario", "Aringay", "Bacnotan", "Bangar", "Balaoan", "Caba", "Naguilian", "Santo Tomas", "Tubao", "San Gabriel", "Santol", "Luna", "Pugo", "Bagulin"],
      "Pangasinan": ["Dagupan", "Urdaneta", "San Carlos", "Alaminos", "Lingayen", "Binmaley", "Calasiao", "Mangaldan", "Manaoag", "San Fabian", "Bugallon", "Bani", "Bolinao", "Anda", "Infanta", "Sual", "Labrador", "Agno", "Mabini", "Bautista", "Bayambang", "Binalonan", "Malasiqui", "Mapandan", "Pozorrubio", "Rosales", "Santa Barbara", "Santo Tomas", "Tayug", "Umingan", "Urbiztondo", "Villasis", "Alcala", "Asingan", "Balungao", "Basista", "Dasol"]
    },
    "Region II (Cagayan Valley)": {
      "Batanes": ["Basco", "Ivana", "Mahatao", "Sabtang", "Uyugan", "Itbayat"],
      "Cagayan": ["Tuguegarao", "Aparri", "Lal-lo", "Sanchez-Mira", "Santa Ana", "Ballesteros", "Buguey", "Camalaniugan", "Claveria", "Enrile", "Iguig", "Peñablanca", "Solana", "Tuao", "Abulug", "Alcala", "Amulung", "Baggao", "Calayan", "Gattaran", "Gonzaga", "Lasam", "Pamplona", "Piat", "Rizal", "Santa Cruz", "Santa Praxedes", "Santo Niño"],
      "Isabela": ["Santiago", "Cauayan", "Ilagan", "Roxas", "Tumauini", "Cabatuan", "Alicia", "Angadanan", "Aurora", "Benito Soliven", "Burgos", "Cabagan", "Cordon", "Delfin Albano", "Echague", "Gamu", "Jones", "Mallig", "Naguilian", "Palanan", "Quirino", "Ramon", "Reina Mercedes", "San Agustin", "San Guillermo", "San Isidro", "San Manuel", "San Mariano", "San Mateo", "San Pablo", "Santa Maria", "Santo Tomas"],
      "Nueva Vizcaya": ["Bayombong", "Solano", "Bambang", "Bagabag", "Aritao", "Dupax del Sur", "Dupax del Norte", "Kasibu", "Kayapa", "Quezon", "Villaverde", "Ambaguio", "Alfonso Castañeda", "Diadi", "Santa Fe", "San Nicolas"],
      "Quirino": ["Cabarroguis", "Diffun", "Saguday", "Aglipay", "Maddela", "Nagtipunan"]
    },
    "Region III (Central Luzon)": {
      "Aurora": ["Baler", "Casiguran", "Dipaculao", "Dinalungan", "Dingalan", "Maria Aurora", "San Luis"],
      "Bataan": ["Balanga", "Mariveles", "Limay", "Hermosa", "Orani", "Samal", "Abucay", "Dinalupihan", "Morong", "Bagac", "Orion", "Pilar"],
      "Bulacan": ["Malolos", "Meycauayan", "San Jose del Monte", "Baliuag", "Marilao", "Bocaue", "Santa Maria", "Pandi", "Norzagaray", "Angat", "Bustos", "Plaridel", "Pulilan", "Calumpit", "Hagonoy", "Paombong", "Bulakan", "Obando", "Guiguinto", "San Rafael", "San Ildefonso", "San Miguel", "San Simon", "Balagtas", "Doña Remedios Trinidad"],
      "Nueva Ecija": ["Cabanatuan", "Gapan", "Palayan", "San Jose", "Science City of Muñoz", "San Leonardo", "Santa Rosa", "Talavera", "Cabiao", "San Antonio", "San Isidro", "General Tinio", "Zaragoza", "Aliaga", "Bongabon", "Carranglan", "Cuyapo", "Gabaldon", "General Mamerto Natividad", "Guimba", "Jaén", "Laur", "Licab", "Llanera", "Lupao", "Nampicuan", "Pantabangan", "Peñaranda", "Quezon", "Rizal", "Santo Domingo", "Talugtug"],
      "Pampanga": ["Angeles", "San Fernando", "Mabalacat", "Lubao", "Guagua", "Mexico", "Apalit", "Macabebe", "Arayat", "Santa Rita", "Floridablanca", "Porac", "San Luis", "Sasmuan", "Minalin", "Bacolor", "Candaba", "Magalang", "Masantol", "Santo Tomas"],
      "Tarlac": ["Tarlac City", "Capas", "Concepcion", "Camiling", "Paniqui", "Gerona", "Moncada", "San Jose", "La Paz", "Bamban", "Victoria", "San Clemente", "Anao", "Pura", "Ramos", "Mayantoc", "Santa Ignacia", "San Manuel"],
      "Zambales": ["Olongapo", "Iba", "Subic", "San Marcelino", "Castillejos", "Botolan", "Masinloc", "Palauig", "Santa Cruz", "Candelaria", "San Felipe", "San Narciso", "San Antonio", "Cabangan", "San Felipe", "San Marcelino"]
    },
    "Region IV-A (CALABARZON)": {
      "Batangas": ["Batangas City", "Lipa", "Tanauan", "Santo Tomas", "Balayan", "Nasugbu", "Lemery", "Taal", "Bauan", "San Pascual", "Calaca", "Calatagan", "Lian", "Tuy", "Balete", "Cuenca", "Laurel", "Malvar", "Mataas na Kahoy", "Padre Garcia", "Rosario", "San Jose", "San Juan", "San Luis", "San Nicolas", "Santa Teresita", "Talisay", "Tingloy", "Ibaan", "Mabini", "Agoncillo", "Alitagtag"],
      "Cavite": ["Imus", "Bacoor", "Dasmariñas", "General Trias", "Trece Martires", "Silang", "Tagaytay", "Cavite City", "Carmona", "General Mariano Alvarez", "General Emilio Aguinaldo", "Amadeo", "Alfonso", "Indang", "Magallanes", "Maragondon", "Mendez", "Naic", "Noveleta", "Rosario", "Tanza", "Ternate", "Kawit"],
      "Laguna": ["Santa Rosa", "Biñan", "Calamba", "San Pedro", "Cabuyao", "Santa Cruz", "Los Baños", "San Pablo", "Calauan", "Alaminos", "Bay", "Victoria", "Pagsanjan", "Pila", "Lumban", "Paete", "Pakil", "Siniloan", "Famy", "Mabitac", "Santa Maria", "Magdalena", "Majayjay", "Liliw", "Nagcarlan", "Rizal", "Luisiana", "Cavinti", "Kalayaan", "Pangil"],
      "Quezon": ["Lucena", "Tayabas", "Sariaya", "Tiaong", "Candelaria", "San Antonio", "Lucban", "Gumaca", "Lopez", "Tagkawayan", "Pagbilao", "Atimonan", "Mauban", "Infanta", "General Nakar", "Real", "Unisan", "Alabat", "Guinayangan", "Mulanay", "San Narciso", "San Andres", "Padre Burgos", "Plaridel", "Quezon", "Macalelon", "Sampaloc", "Catanauan"],
      "Rizal": ["Antipolo", "Taytay", "Cainta", "Binangonan", "Angono", "San Mateo", "Rodriguez", "Tanay", "Baras", "Teresa", "Morong", "Cardona", "Jala-Jala", "Pililla"]
    },
    "Region IV-B (MIMAROPA)": {
      "Marinduque": ["Boac", "Gasan", "Mogpog", "Santa Cruz", "Torrijos", "Buenavista", "General Luna"],
      "Occidental Mindoro": ["San Jose", "Mamburao", "Sablayan", "Abra de Ilog", "Calintaan", "Paluan", "Rizal", "Santa Cruz", "Magsaysay", "Lubang", "Looc"],
      "Oriental Mindoro": ["Calapan", "Pinamalayan", "Naujan", "Bongabong", "Puerto Galera", "San Teodoro", "Baco", "Victoria", "Socorro", "Pola", "Mansalay", "Gloria", "Bansud", "Bulalacao", "Roxas", "Naujan"],
      "Palawan": ["Puerto Princesa", "Coron", "El Nido", "Taytay", "Narra", "Brooke's Point", "San Vicente", "Quezon", "Roxas", "Aborlan", "Bataraza", "Busuanga", "Culion", "Linapacan", "Magsaysay", "Dumaran", "Araceli", "Balabac", "Cuyo", "Agutaya"],
      "Romblon": ["Romblon", "Odiongan", "San Jose", "Looc", "San Agustin", "San Andres", "Santa Fe", "Cajidiocan", "Magdiwang", "Ferrol", "Calatrava", "Concepcion", "Corcuera", "Banton", "Alcantara", "Santa Maria"]
    },
    "Region V (Bicol)": {
      "Albay": ["Legazpi", "Tabaco", "Ligao", "Daraga", "Camalig", "Guinobatan", "Polangui", "Oas", "Libon", "Manito", "Malinao", "Tiwi", "Bacacay", "Santo Domingo", "Rapu-Rapu", "Jovellar", "Pio Duran"],
      "Camarines Norte": ["Daet", "Jose Panganiban", "Labo", "Vinzons", "Mercedes", "Talisay", "Basud", "San Vicente", "Capalonga", "Paracale", "San Lorenzo Ruiz", "Santa Elena"],
      "Camarines Sur": ["Naga", "Iriga", "Pili", "Libmanan", "Bula", "Nabua", "Bato", "Baao", "San Fernando", "Calabanga", "Goa", "Tigaon", "Sipocot", "Ragay", "Lupi", "Milaor", "Canaman", "Magarao", "Ocampo", "Bombon", "Minalabac", "Pasacao", "Tinambac", "Siruma", "Lagonoy", "Garchitorena", "Presentacion", "Caramoan", "Sagñay", "San Jose", "Buhi", "Balatan", "Cabusao"],
      "Catanduanes": ["Virac", "San Andres", "Caramoran", "Pandan", "Viga", "Bato", "Baras", "Gigmoto", "Bagamanoc", "San Miguel", "Panganiban"],
      "Masbate": ["Masbate City", "Aroroy", "Milagros", "Uson", "Mobo", "Cataingan", "Placer", "Balud", "Dimasalang", "Esperanza", "Mandaon", "Palanas", "Pio V. Corpus", "Batuan", "San Fernando", "San Jacinto", "Monreal", "Claveria", "Cawayan"],
      "Sorsogon": ["Sorsogon City", "Bulan", "Irosin", "Gubat", "Castilla", "Magallanes", "Juban", "Prieto Diaz", "Pilar", "Santa Magdalena", "Barcelona", "Bulusan", "Matnog", "Donsol", "Casiguran", "Sorsogon"]
    },
    "Region VI (Western Visayas)": {
      "Aklan": ["Kalibo", "New Washington", "Banga", "Ibajay", "Malinao", "Makato", "Numancia", "Lezo", "Tangalan", "Batan", "Altavas", "Balete", "Buruanga", "Libacao", "Madalag", "Nabas", "Malay"],
      "Antique": ["San Jose de Buenavista", "Sibalom", "Culasi", "Hamtic", "Bugasong", "Pandan", "Caluya", "Libertad", "Tobias Fornier", "Anini-y", "Barbaza", "Belison", "Patnongon", "San Remigio", "Sebaste", "Tibiao", "Valderrama", "Laua-an"],
      "Capiz": ["Roxas City", "Mambusao", "Pontevedra", "President Roxas", "Panay", "Dao", "Sigma", "Ivisan", "Jamindan", "Maayon", "Panitan", "Pilar", "Sapian", "Tapaz", "Cuartero", "Dumalag", "Dumarao", "San Dionisio", "Mambusao"],
      "Guimaras": ["Jordan", "Buenavista", "Nueva Valencia", "San Lorenzo", "Sibunag"],
      "Iloilo": ["Iloilo City", "Passi", "Oton", "Pavia", "Santa Barbara", "Pototan", "Cabatuan", "Janiuay", "Miagao", "Tigbauan", "Guimbal", "San Joaquin", "Dumangas", "Barotac Nuevo", "Barotac Viejo", "Ajuy", "Balasan", "Banate", "Carles", "Concepcion", "Dingle", "Dueñas", "Estancia", "Lemery", "Mina", "New Lucena", "San Dionisio", "San Enrique", "San Miguel", "Santa Rosa", "Sara", "Zarraga", "Leganes", "Alimodian", "Anilao", "Badiangan", "Bingawan", "Lambunao", "Maasin", "Passi"],
      "Negros Occidental": ["Bacolod", "Bago", "Cadiz", "Escalante", "Himamaylan", "Kabankalan", "La Carlota", "Sagay", "San Carlos", "Silay", "Sipalay", "Talisay", "Victorias", "Murcia", "Binalbagan", "Hinigaran", "Isabela", "La Castellana", "Manapla", "Pontevedra", "San Enrique", "Salvador Benedicto", "Toboso", "Pulupandan", "Valladolid"]
    },
    "Region VII (Central Visayas)": {
      "Bohol": ["Tagbilaran", "Tubigon", "Calape", "Maribojoc", "Loon", "Antequera", "Baclayon", "Dauis", "Panglao", "Balilihan", "Catigbian", "Carmen", "Sagbayan", "Inabanga", "Clarin", "Getafe", "Talibon", "Ubay", "Trinidad", "San Miguel", "Dagohoy", "Danao", "Jagna", "Duero", "Guindulman", "Anda", "Valencia", "Dimiao", "Loay", "Alburquerque", "Corella", "Sikatuna", "Loboc", "Bilar", "Batuan", "Garcia Hernandez", "Mabini", "Bien Unido", "Pilar", "Alicia", "Esperanza", "Candijay"],
      "Cebu": ["Cebu City", "Lapu-Lapu", "Mandaue", "Talisay", "Toledo", "Danao", "Naga", "Bogo", "Carcar", "Minglanilla", "Consolacion", "Liloan", "Compostela", "Cordova", "Balamban", "Asturias", "Tuburan", "Tabuelan", "San Remigio", "Bantayan", "Santa Fe", "Medellin", "Daanbantayan", "Sogod", "Borbon", "Tabogon", "Catmon", "Carmen", "Dalaguete", "Argao", "Sibonga", "Badian", "Moalboal", "Alcantara", "Ronda", "Dumanjug", "Barili", "Aloguinsan", "Pinamungajan"],
      "Negros Oriental": ["Dumaguete", "Bais", "Tanjay", "Bayawan", "Guihulngan", "Sibulan", "Valencia", "Bacong", "Dauin", "Zamboanguita", "Siaton", "Santa Catalina", "Mabinay", "Manjuyod", "Bindoy", "Ayungon", "Jimalalud", "La Libertad", "Tayasan", "Pamplona", "San Jose", "Amlan", "Canlaon", "Vallehermoso"],
      "Siquijor": ["Siquijor", "Larena", "Lazi", "Maria", "San Juan", "Enrique Villanueva", "San Vicente"]
    },
    "Region VIII (Eastern Visayas)": {
      "Biliran": ["Naval", "Almeria", "Cabucgayan", "Caibiran", "Culaba", "Kawayan", "Maripipi"],
      "Eastern Samar": ["Borongan", "Guiuan", "Llorente", "Balangiga", "Salcedo", "General MacArthur", "Hernani", "Quinapondan", "Mercedes", "Lawaan", "Balangkayan", "Maydolong", "San Julian", "Dolores", "Oras", "Jipapad", "Arteche", "Can-avid", "Maslog", "Taft", "Sulat", "San Policarpo"],
      "Leyte": ["Tacloban", "Ormoc", "Baybay", "Palo", "Tanauan", "Burauen", "Carigara", "Palompon", "Abuyog", "Hilongos", "Bato", "Matalom", "Bontoc", "Sogod", "Albuera", "Babatngon", "Barugo", "Calubian", "Capoocan", "Dagami", "Dulag", "Isabel", "Javier", "Jaro", "Julita", "Kananga", "La Paz", "Leyte", "MacArthur", "Mahaplag", "Matag-ob", "Merida", "Pastrana", "San Isidro", "San Miguel", "Santa Fe", "Tabango", "Tabontabon", "Tolosa", "Tunga", "Villaba"],
      "Northern Samar": ["Catarman", "Allen", "Laoang", "Palapag", "Bobon", "Rosario", "Victoria", "San Jose", "Lavezares", "Biri", "Capul", "Gamay", "Lapinig", "Mapanas", "Mondragon", "San Antonio", "San Isidro", "San Roque", "San Vicente", "Silvino Lobos", "Lope de Vega", "Pambujan", "Santa Margarita", "Catubig", "Las Navas"],
      "Samar": ["Catbalogan", "Calbayog", "Basey", "Marabut", "Santa Rita", "Talalora", "Villareal", "Pinabacdao", "Calbiga", "San Sebastian", "San Jorge", "Tarangnan", "Gandara", "Matuguinao", "Pagsanghan", "Santa Margarita", "Sto. Niño", "Motiong", "Hinabangan", "Jiabong", "San Jose de Buan", "Almagro", "Daram", "Zumarraga", "Paranas"],
      "Southern Leyte": ["Maasin", "Sogod", "Bato", "Bontoc", "Hinunangan", "Hinundayan", "Anahawan", "San Juan", "Saint Bernard", "Liloan", "San Francisco", "Pintuyan", "San Ricardo", "Padre Burgos", "Limasawa", "Malitbog", "Tomas Oppus", "Libagon", "Silago", "Macrohon"]
    },
    "Region IX (Zamboanga Peninsula)": {
      "Zamboanga del Norte": ["Dipolog", "Dapitan", "Sindangan", "Liloy", "Manukan", "Piñan", "Roxas", "Katipunan", "Labason", "Jose Dalman", "Rizal", "Sergio Osmeña Sr.", "Kalawit", "Siayan", "Tampilisan", "Gutalac", "Baliguian", "Leon B. Postigo", "Salug", "Sibutad", "La Libertad", "Mutia", "Polanco", "Pres. Manuel A. Roxas"],
      "Zamboanga del Sur": ["Zamboanga City", "Pagadian", "Molave", "Aurora", "Tukuran", "Dumalinao", "San Miguel", "Lakewood", "Midsalip", "Dumingag", "Mahayag", "Tambulig", "Bayog", "Kumalarang", "Margosatubig", "Pitogo", "Vincenzo A. Sagun", "Dimataling", "Tabina", "Guipos", "Tigbao", "Labangan", "Ramon Magsaysay", "Sominot", "Josefina", "Lapuyan", "San Pablo"],
      "Zamboanga Sibugay": ["Ipil", "Kabasalan", "Naga", "Siay", "Imelda", "Tungawan", "Titay", "Alicia", "Olutanga", "Mabuhay", "Talusan", "Payao", "R.T. Lim", "Diplahan", "Malangas", "Buug"]
    },
    "Region X (Northern Mindanao)": {
      "Bukidnon": ["Malaybalay", "Valencia", "Don Carlos", "Maramag", "Quezon", "Manolo Fortich", "Malitbog", "Sumilao", "Libona", "Baungon", "Talakag", "Lantapan", "Cabanglasan", "Impasugong", "Kibawe", "Dangcagan", "Kadingilan", "Kitaotao", "Pangantucan", "Kalilangan", "San Fernando", "Talakag"],
      "Camiguin": ["Mambajao", "Catarman", "Mahinog", "Sagay", "Guinsiliban"],
      "Lanao del Norte": ["Iligan", "Tubod", "Kapatagan", "Lala", "Magsaysay", "Kolambugan", "Baroy", "Maigo", "Balo-i", "Pantar", "Kauswagan", "Linamon", "Matungao", "Munai", "Nunungan", "Poona Piagapo", "Tangcal", "Sapad", "Salvador", "Bacolod", "Sultan Naga Dimaporo"],
      "Misamis Occidental": ["Oroquieta", "Ozamiz", "Tangub", "Clarin", "Tudela", "Sinacaban", "Jimenez", "Panaon", "Aloran", "Concepcion", "Bonifacio", "Don Victoriano Chiongbian", "Baliangao", "Plaridel", "Sapang Dalaga", "Calamba", "Lopez Jaena"],
      "Misamis Oriental": ["Cagayan de Oro", "Gingoog", "El Salvador", "Tagoloan", "Villanueva", "Jasaan", "Claveria", "Balingasag", "Medina", "Balingoan", "Kinoguitan", "Sugbongcogon", "Salay", "Lagonglong", "Magsaysay", "Binuangan", "Talisayan", "Initao", "Libertad", "Naawan", "Manticao", "Opol", "Alubijid", "Laguindingan", "Gitagum", "Lugait"]
    },
    "Region XI (Davao)": {
      "Davao de Oro": ["Nabunturan", "Compostela", "Monkayo", "Montevista", "Maco", "Mawab", "Pantukan", "Mabini", "New Bataan", "Maragusan", "Laak"],
      "Davao del Norte": ["Tagum", "Panabo", "Island Garden City of Samal", "Carmen", "Kapalong", "New Corella", "Santo Tomas", "Braulio E. Dujali", "Asuncion", "San Isidro", "Talaingod"],
      "Davao del Sur": ["Davao City", "Digos", "Bansalan", "Magsaysay", "Santa Cruz", "Hagonoy", "Padada", "Sulop", "Kiblawan", "Malalag", "Matanao", "Santa Maria"],
      "Davao Occidental": ["Malita", "Santa Maria", "Don Marcelino", "Jose Abad Santos", "Sarangani"],
      "Davao Oriental": ["Mati", "Baganga", "Caraga", "Cateel", "Manay", "San Isidro", "Tarragona", "Boston", "Lupon", "Governor Generoso", "Banaybanay"]
    },
    "Region XII (SOCCSKSARGEN)": {
      "Cotabato": ["Kidapawan", "Midsayap", "M'lang", "Matalam", "Pigcawayan", "Libungan", "Aleosan", "Alamada", "Banisilan", "Carmen", "Kabacan", "Magpet", "Makilala", "Antipas", "Arakan", "President Roxas", "Tulunan", "Pikit"],
      "Sarangani": ["Alabel", "Malungon", "Glan", "Kiamba", "Maasim", "Maitum", "Malapatan", "Malungon"],
      "South Cotabato": ["General Santos", "Koronadal", "Polomolok", "Tupi", "T'boli", "Surallah", "Banga", "Lake Sebu", "Santo Niño", "Norala", "Tantangan", "Tampakan"],
      "Sultan Kudarat": ["Tacurong", "Isulan", "Kalamansig", "Lebak", "Bagumbayan", "Palimbang", "Lutayan", "Lambayong", "Esperanza", "President Quirino", "Senator Ninoy Aquino", "Columbio"]
    },
    "Region XIII (Caraga)": {
      "Agusan del Norte": ["Butuan", "Cabadbaran", "Carmen", "Buenavista", "Nasipit", "Magallanes", "Tubay", "Jabonga", "Kitcharao", "Santiago", "Remedios T. Romualdez", "Las Nieves"],
      "Agusan del Sur": ["Prosperidad", "San Francisco", "Bayugan", "Talacogon", "Trento", "Bunawan", "Loreto", "Veruela", "Rosario", "Esperanza", "La Paz", "Santa Josefa", "Sibagat"],
      "Dinagat Islands": ["San Jose", "Dinagat", "Basilisa", "Cagdianao", "Libjo", "Loreto", "Tubajon"],
      "Surigao del Norte": ["Surigao City", "Dapa", "Del Carmen", "General Luna", "San Isidro", "Burgos", "Santa Monica", "Pilar", "San Benito", "Bacuag", "Gigaquit", "Claver", "Mainit", "Placer", "Sison", "Tagana-an", "Alegria", "Malimono", "Sison"],
      "Surigao del Sur": ["Tandag", "Bislig", "Cantilan", "Carrascal", "Madrid", "Lanuza", "Cortes", "San Miguel", "Tago", "San Agustin", "Bayabas", "Marihatag", "Cagwait", "Barobo", "Lianga", "Tagbina", "Hinatuan", "Lingig"]
    },
    "BARMM (Bangsamoro)": {
      "Basilan": ["Isabela City", "Lamitan", "Sumisip", "Tipo-Tipo", "Tuburan", "Maluso", "Lantawan", "Akbar", "Al-Barka", "Hadji Mohammad Ajul", "Ungkaya Pukan", "Tabuan-Lasa"],
      "Lanao del Sur": ["Marawi", "Malabang", "Balabagan", "Binidayan", "Marantao", "Masiu", "Piagapo", "Saguiaran", "Tamparan", "Taraka", "Bacolod-Kalawi", "Balindong", "Bayang", "Buadiposo-Buntong", "Bubong", "Ditsaan-Ramain", "Ganassi", "Kapatagan", "Lumbaca-Unayan", "Madalum", "Madamba", "Maguing", "Pagayawan", "Picong", "Poona Bayabao", "Pualas", "Sultan Dumalondong", "Tagoloan II", "Wao", "Kapai", "Mulondo", "Marogong"],
      "Maguindanao del Norte": ["Cotabato City", "Datu Odin Sinsuat", "Sultan Kudarat", "Datu Blah T. Sinsuat", "Upi", "Parang", "Barira", "Buldon", "Matanog", "Northern Kabuntalan", "Kabuntalan", "Talitay"],
      "Maguindanao del Sur": ["Buluan", "Datu Piang", "Shariff Aguak", "Datu Saudi-Ampatuan", "Datu Unsay", "Guindulungan", "Talayan", "South Upi", "Ampatuan", "Datu Abdullah Sangki", "Datu Anggal Midtimbang", "Datu Hoffer Ampatuan", "Datu Montawal", "Datu Paglas", "Datu Salibo", "Esperanza", "Mamasapano", "Mangudadatu", "Pagalungan", "Paglat", "Pandag", "Rajah Buayan", "Shariff Saydona Mustapha", "Sultan sa Barongis"],
      "Sulu": ["Jolo", "Parang", "Patikul", "Talipao", "Maimbung", "Indanan", "Siasi", "Banguingui", "Panglima Sugala", "Panamao", "Luuk", "Kalingalan Caluang", "Pata", "Tapul", "Pandami", "Omar", "Hadji Panglima Tahil"],
      "Tawi-Tawi": ["Bongao", "Panglima Sugala", "Simunul", "Sitangkai", "Tandubas", "South Ubian", "Sapa-Sapa", "Languyan", "Mapun", "Turtle Islands", "Sibutu"]
    },
    "CAR (Cordillera)": {
      "Abra": ["Bangued", "Bucay", "Lagangilang", "La Paz", "Manabo", "Pidigan", "San Juan", "San Isidro", "Tayum", "Villaviciosa", "Boliney", "Bucloc", "Daguioman", "Danglas", "Dolores", "Lacub", "Langiden", "Licuan-Baay", "Luba", "Malibcong", "Peñarrubia", "Sallapadan", "Sison", "Tubo"],
      "Apayao": ["Kabugao", "Conner", "Flora", "Pudtol", "Luna", "Santa Marcela", "Calanasan"],
      "Benguet": ["Baguio", "La Trinidad", "Itogon", "Tuba", "Sablan", "Tublay", "Atok", "Bokod", "Buguias", "Kabayan", "Kapangan", "Kibungan", "Mankayan", "Bakun"],
      "Ifugao": ["Lagawe", "Kiangan", "Banaue", "Hingyon", "Hungduan", "Tinoc", "Asipulo", "Mayoyao", "Aguinaldo", "Alfonso Lista", "Lamut"],
      "Kalinga": ["Tabuk", "Balbalan", "Lubuagan", "Pasil", "Pinukpuk", "Rizal", "Tanudan", "Tinglayan"],
      "Mountain Province": ["Bontoc", "Barlig", "Bauko", "Besao", "Natonin", "Paracelis", "Sabangan", "Sadanga", "Sagada", "Tadian"]
    }
  };

  // Representative city → benchmark market value per sqm (₱) for land
  // Static placeholder benchmark data — replace with live market feed in production.
  const CITY_BENCHMARKS = {
    "Manila": 95000, "Makati": 220000, "Taguig": 210000, "Pasig": 140000, "Quezon City": 90000,
    "Mandaluyong": 150000, "Muntinlupa": 110000, "Parañaque": 100000, "Pasay": 120000,
    "Cebu City": 85000, "Lapu-Lapu": 60000, "Mandaue": 65000, "Davao City": 55000,
    "Iloilo City": 52000, "Bacolod": 42000, "Baguio": 58000, "Angeles": 48000,
    "San Fernando": 42000, "Cagayan de Oro": 46000, "Zamboanga City": 38000,
    "General Santos": 36000, "Tacloban": 34000, "Puerto Princesa": 32000, "Legazpi": 30000,
    "Butuan": 30000, "Naga": 32000, "Marawi": 26000, "Taguig": 210000,
    "Imus": 18500, "Bacoor": 17000, "Dasmariñas": 15000, "General Trias": 14000,
    "Santa Rosa": 28000, "Biñan": 24000, "Calamba": 20000, "Antipolo": 22000,
    "Meycauayan": 16000, "Silang": 12000, "Tagaytay": 26000, "Lipa": 18000,
    "Tanauan": 16000, "Malolos": 14000, "Santa Maria": 15000, "Taytay": 17000,
    "Cainta": 16000, "San Pedro": 19000, "Cabuyao": 20000, "Trece Martires": 12000,
    "Mariveles": 10000, "Balanga": 12000, "Coron": 28000, "Ormoc": 24000,
    "Talisay": 45000, "Minglanilla": 38000, "Mabalacat": 35000, "Batangas City": 22000
  };
  const DEFAULT_BENCHMARK = 14000;

  // BIR zonal multiplier relative to market benchmark (approximate)
  const BIR_ZONAL_RATIO = 0.42;

  // Construction cost per sqm by construction type (₱, 2026 PH mid-range)
  const CONSTRUCTION_BASE_YEAR = 2026;
  const CONSTRUCTION_COST = {
    "Wood": 16000, "Mixed": 20000, "CHB / Masonry": 25000, "Reinforced Concrete": 32000,
    "Steel": 26000, "Prefabricated": 22000
  };
  // Typical economic life in years used by PH assessors / PVS practice for straight-line depreciation
  const CONSTRUCTION_ECON_LIFE = {
    "Wood": 30, "Mixed": 45, "CHB / Masonry": 50, "Reinforced Concrete": 70,
    "Steel": 55, "Prefabricated": 35
  };

  // Development types
  const DEV_TYPES = ["Vacant Lot", "Townhouse", "Apartment", "Shophouse", "Commercial", "Warehouse", "Mixed Use", "Subdivision", "Subdivision + Shophouse"];

  // Property types
  const PROPERTY_TYPES = ["Vacant Lot", "House & Lot", "Condominium Unit", "Commercial", "Industrial", "Agricultural"];

  // Amenities list
  const AMENITIES = ["Parking", "Clubhouse", "Swimming Pool", "Gym", "Guard House", "Landscaping", "Generator", "Water Tank"];

  // Utility toggles
  const UTILITIES = ["Electricity", "Water", "Internet", "Sewer"];

  // Nearby establishment types
  const NEARBY_TYPES = ["School", "Hospital", "Bank", "Convenience Store", "Gas Station", "Market", "Church", "Restaurant", "Mall", "Transit"];

  // IRR tolerance
  const IRR_TOL = 1e-7;

  function benchmarkFor(city) {
    if (!city) return DEFAULT_BENCHMARK;
    const key = city.trim().toLowerCase();
    for (const k in CITY_BENCHMARKS) {
      if (k.toLowerCase() === key) return CITY_BENCHMARKS[k];
    }
    return DEFAULT_BENCHMARK;
  }

  // Cached geocoding simulation for PH place names → coordinates
  const PLACE_COORDS = {
    "Manila": [14.5995, 120.9842], "Makati": [14.5547, 121.0244], "Taguig": [14.5176, 121.0509],
    "Quezon City": [14.6760, 121.0437], "Cebu City": [10.3157, 123.8854], "Davao City": [7.1907, 125.4553],
    "Iloilo City": [10.7202, 122.5621], "Baguio": [16.4023, 120.5960], "Imus": [14.4297, 120.9367],
    "Bacoor": [14.4600, 120.9500], "Santa Rosa": [14.3121, 121.1113], "Antipolo": [14.5864, 121.1774],
    "Cagayan de Oro": [8.4542, 124.6319], "Batangas City": [13.7565, 121.0583], "Lipa": [13.9411, 121.1628],
    "Legazpi": [13.1391, 123.7438], "Naga": [13.6210, 123.1690], "Tacloban": [11.2467, 125.0051]
  };
  function coordsFor(city) {
    const key = (city || "").trim().toLowerCase();
    for (const k in PLACE_COORDS) if (k.toLowerCase() === key) return PLACE_COORDS[k];
    return [13.0, 122.0];
  }

  function regionNames() { return PH_REGIONS.map(r => r[0]); }
  function provincesFor(region) {
    const r = PH_REGIONS.find(x => x[0] === region);
    return r ? r[1] : [];
  }
  function citiesFor(region, province) {
    const r = PH_REGIONS.find(x => x[0] === region);
    if (!r) return [];
    const regionMap = PH_CITY_MAP[region] || {};
    return regionMap[String(province || "").trim()] || [];
  }

  window.ESREALTY = window.ESREALTY || {};
  window.ESREALTY.data = {
    PH_REGIONS, CITY_BENCHMARKS, DEFAULT_BENCHMARK, BIR_ZONAL_RATIO,
    CONSTRUCTION_COST, CONSTRUCTION_ECON_LIFE, CONSTRUCTION_BASE_YEAR, DEV_TYPES, PROPERTY_TYPES, AMENITIES, UTILITIES,
    NEARBY_TYPES, IRR_TOL, benchmarkFor, coordsFor, regionNames, provincesFor, citiesFor
  };
})();
