// Auto-extracted from your original App.jsx GOVT_SCHEMES constant.
// Used by seedGovtSchemes.js to push the real scheme data into Firestore.
const GOVT_SCHEMES = [
  {
    id: "scheme-01",
    icon: "🏥", name: "Ayushman Bharat (PM-JAY)",
    desc: "Free hospitalisation cover up to ₹5 lakh per family per year at empanelled hospitals.",
    eligibilitySummary: "Families listed under SECC database / state extension criteria",
    officialLink: "https://pmjay.gov.in/",
    detailLink: "https://www.myscheme.gov.in/schemes/ab-pmjay",
    eligibility: {
      en: [
        "Rural Beneficiaries: Households living in single-room dwellings with kucha walls/roofs, households with no adult male member aged 16–59, disabled members with no able-bodied adult for support, and SC/ST or landless households deriving major income from manual casual labour.",
        "Urban Beneficiaries: Families belonging to 11 defined occupational categories, including ragpickers, domestic workers, street vendors, sanitation workers, and construction labourers.",
        "Automatic Inclusions: Destitute individuals, manual scavengers, legally released bonded labour, primitive tribal groups, and households without shelter.",
        "RSBY Coverage: Families enrolled under Rashtriya Swasthya Bima Yojana (RSBY) as of 28 February 2018 are automatically eligible.",
        "Senior Citizens: As of September 2024, all senior citizens aged 70 years and above are eligible for up to ₹5 lakh health coverage, regardless of socio-economic status.",
      ],
      hi: [
        "ग्रामीण लाभार्थी: एक कमरे के कच्चे मकान में रहने वाले परिवार, जिनमें 16 से 59 वर्ष के बीच कोई वयस्क पुरुष सदस्य न हो, दिव्यांग सदस्य जिनकी सहायता के लिए कोई सक्षम वयस्क न हो, तथा SC/ST या भूमिहीन परिवार जिनकी मुख्य आय शारीरिक श्रम से होती है।",
        "शहरी लाभार्थी: 11 निर्धारित व्यावसायिक श्रेणियों के परिवार, जैसे कबाड़ बीनने वाले, घरेलू कामगार, फेरीवाले, सफाई कर्मचारी और निर्माण मजदूर।",
        "स्वचालित समावेशन: निराश्रित व्यक्ति, सफाई कर्मी, कानूनी रूप से मुक्त बंधुआ मजदूर, आदिम जनजातीय समूह और बेघर परिवार।",
        "RSBY कवरेज: 28 फरवरी 2018 तक RSBY के तहत पंजीकृत परिवार स्वतः पात्र हैं।",
        "वरिष्ठ नागरिक: सितंबर 2024 से, 70 वर्ष या उससे अधिक आयु के सभी वरिष्ठ नागरिक, सामाजिक-आर्थिक स्थिति की परवाह किए बिना, ₹5 लाख तक के स्वास्थ्य कवरेज के लिए पात्र हैं।",
      ],
    },
    documents: {
      en: [
        "Aadhaar card or government-approved photo ID.",
        "Ration card or alternative family ID.",
        "Socio-Economic Caste Census (SECC) reference number (for rural families).",
        "Proof of Address and contact details (mobile, e-mail).",
        "Caste Certificate and Income Certificate (if applicable).",
        "Document proof of the current status of the family (joint or nuclear).",
      ],
      hi: [
        "आधार कार्ड या सरकार द्वारा स्वीकृत फोटो पहचान पत्र।",
        "राशन कार्ड या वैकल्पिक परिवार पहचान पत्र।",
        "SECC संदर्भ संख्या (ग्रामीण परिवारों के लिए)।",
        "पता प्रमाण और संपर्क विवरण (मोबाइल, ईमेल)।",
        "जाति प्रमाण पत्र और आय प्रमाण पत्र (यदि लागू हो)।",
        "परिवार की वर्तमान स्थिति का दस्तावेज़ी प्रमाण (संयुक्त या एकल)।",
      ],
    },
  },
  {
    id: "scheme-02",
    icon: "🤰", name: "Janani Suraksha Yojana (JSY)",
    desc: "Cash assistance for institutional delivery to reduce maternal and infant mortality.",
    eligibilitySummary: "Pregnant women, especially BPL households in low-performing states",
    officialLink: "https://nhm.gov.in/",
    detailLink: "https://www.myscheme.gov.in/schemes/jsy1",
    eligibility: {
      en: [
        "Low Performing States (LPS): All pregnant women delivering in a government or accredited private health institution are eligible — no marriage or BPL certification needed.",
        "High Performing States (HPS): Pregnant women delivering in government institutions are eligible only if they belong to a BPL household or SC/ST.",
        "Accredited Private Institutions: Across all states, the applicant must be from a BPL household or an SC/ST woman with a referral slip from health workers.",
        "Home Deliveries: Pregnant women from BPL households receive cash benefits for home births, regardless of age and number of children.",
        "Specific Exclusions/Criteria: Depending on state norms, benefit for general categories may be restricted to women aged 19+ and the first two live births only — SC/ST women are exempt from this parity limit.",
      ],
      hi: [
        "निम्न निष्पादन वाले राज्य (LPS): सरकारी या मान्यता प्राप्त निजी स्वास्थ्य संस्थान में प्रसव कराने वाली सभी गर्भवती महिलाएं पात्र हैं — इसके लिए विवाह या BPL प्रमाणन आवश्यक नहीं है।",
        "उच्च निष्पादन वाले राज्य (HPS): सरकारी संस्थानों में प्रसव कराने वाली गर्भवती महिलाएं केवल तभी पात्र हैं जब वे BPL परिवार या SC/ST से संबंधित हों।",
        "मान्यता प्राप्त निजी संस्थान: सभी राज्यों में, आवेदक को BPL परिवार या SC/ST महिला होना चाहिए और स्वास्थ्य कार्यकर्ता से रेफरल स्लिप होनी चाहिए।",
        "घर पर प्रसव: BPL परिवारों की गर्भवती महिलाओं को घर पर प्रसव के लिए नकद सहायता मिलती है, उम्र और बच्चों की संख्या की परवाह किए बिना।",
        "विशेष अपवाद/मानदंड: राज्य के नियमों के अनुसार, सामान्य श्रेणी के लिए लाभ 19 वर्ष या अधिक उम्र की महिलाओं और केवल पहले दो जीवित प्रसवों तक सीमित हो सकता है — SC/ST महिलाओं को इस सीमा से छूट है।",
      ],
    },
    documents: {
      en: [
        "Mother and Child Protection (MCP) Card.",
        "Photocopy of BPL Ration Card or Antyodaya Anna Yojana card.",
        "Photocopy of SC/ST status certificate (if applicable).",
        "Hospital Discharge Certificate (for institutional delivery).",
        "Copy of Aadhaar Card and passbook of the Aadhaar-linked bank account.",
      ],
      hi: [
        "मातृ एवं शिशु सुरक्षा (MCP) कार्ड।",
        "BPL राशन कार्ड या अंत्योदय अन्न योजना कार्ड की फोटोकॉपी।",
        "SC/ST स्थिति प्रमाण पत्र की फोटोकॉपी (यदि लागू हो)।",
        "अस्पताल डिस्चार्ज प्रमाण पत्र (संस्थागत प्रसव के लिए)।",
        "आधार कार्ड की प्रतिलिपि और आधार-लिंक्ड बैंक खाते की पासबुक।",
      ],
    },
  },
  {
    id: "scheme-03",
    icon: "🍼", name: "Janani Shishu Suraksha Karyakram (JSSK)",
    desc: "Free delivery, C-section and newborn care, including drugs, diet and transport.",
    eligibilitySummary: "All pregnant women delivering in public health institutions",
    officialLink: "https://nhm.gov.in/showlink.php?id=178",
    detailLink: "https://web.umang.gov.in/landing/scheme/detail/janani-shishu-suraksha-karyakram_jssk.html",
    eligibility: {
      en: [
        "Pregnant Women: All pregnant women who access government health facilities for delivery are entitled to completely free and cashless services (including C-sections, medicines, diagnostics and diet).",
        "Sick Newborns: Free treatment is extended to sick newborns and infants accessing government health facilities up to 30 days after birth.",
        "Universal Applicability: Eligibility is non-conditional — no income limit, no BPL condition, and no restriction on religion, caste or state.",
        "No Registration Bar: Entitlement is automatic; no prior registration is required for accessing emergency services.",
      ],
      hi: [
        "गर्भवती महिलाएं: प्रसव के लिए सरकारी स्वास्थ्य सुविधाओं का उपयोग करने वाली सभी गर्भवती महिलाएं पूर्णतः मुफ्त और नकद-रहित सेवाओं (सिजेरियन, दवाइयां, जांच, आहार सहित) की हकदार हैं।",
        "बीमार नवजात: जन्म के 30 दिन बाद तक सरकारी स्वास्थ्य सुविधाओं में आने वाले बीमार नवजातों और शिशुओं को मुफ्त उपचार दिया जाता है।",
        "सार्वभौमिक पात्रता: पात्रता गैर-शर्तीय है — कोई आय सीमा नहीं, कोई BPL शर्त नहीं, और धर्म, जाति या राज्य पर कोई प्रतिबंध नहीं।",
        "कोई पंजीकरण आवश्यक नहीं: पात्रता स्वचालित है; आपातकालीन सेवाओं के लिए पूर्व पंजीकरण की आवश्यकता नहीं है।",
      ],
    },
    documents: {
      en: [
        "Aadhaar Number/Card (helpful for record-keeping but not mandatory for emergency services).",
        "Mother and Child Health (MCH) / Mamta Card (if registered).",
        "Janani Suraksha Yojana (JSY) Card (if the applicant is a JSY beneficiary).",
        "Ration card.",
        "Address proof / Domicile certificate.",
      ],
      hi: [
        "आधार नंबर/कार्ड (रिकॉर्ड के लिए सहायक, पर आपातकालीन सेवाओं के लिए अनिवार्य नहीं)।",
        "मातृ एवं शिशु स्वास्थ्य (MCH) / ममता कार्ड (यदि पंजीकृत हो)।",
        "जननी सुरक्षा योजना (JSY) कार्ड (यदि आवेदक JSY लाभार्थी है)।",
        "राशन कार्ड।",
        "पता प्रमाण / निवास प्रमाण पत्र।",
      ],
    },
  },
  {
    id: "scheme-04",
    icon: "👶", name: "Pradhan Mantri Matru Vandana Yojana (PMMVY)",
    desc: "₹5,000 cash incentive for the first living child to support nutrition and rest.",
    eligibilitySummary: "Pregnant and lactating mothers, first child only",
    officialLink: "https://pmmvy.wcd.gov.in/",
    detailLink: "https://www.myscheme.gov.in/schemes/pmmvy",
    eligibility: {
      en: [
        "Covers pregnant women and lactating mothers who are at least 19 years old.",
        "Provides financial assistance primarily for the first live birth — ₹5,000 in installments to compensate for wage loss and promote healthcare.",
        "Also covers the birth of a second child exclusively if it is a girl, with a single incentive installment of ₹6,000.",
        "Applicants must belong to economically weaker/disadvantaged sections: net family income below ₹8 lakh/year, SC/ST women, or women who are 40% or fully disabled (Divyang Jan).",
        "Beneficiaries holding an MGNREGA Job Card, e-Shram card, BPL Ration Card, PMJAY card, or Kisan Samman Nidhi are also automatically eligible.",
        "Women in regular employment with Central/State Government or PSUs who receive similar paid maternity benefits are strictly excluded.",
      ],
      hi: [
        "यह योजना कम से कम 19 वर्ष की आयु की गर्भवती महिलाओं और स्तनपान कराने वाली माताओं को कवर करती है।",
        "मुख्य रूप से पहले जीवित बच्चे के लिए वित्तीय सहायता — मजदूरी हानि की पूर्ति और स्वास्थ्य देखभाल बढ़ाने के लिए किस्तों में ₹5,000।",
        "दूसरे बच्चे के जन्म पर केवल तभी कवर करती है जब वह बेटी हो — ₹6,000 की एकल प्रोत्साहन किस्त।",
        "आवेदकों को आर्थिक रूप से कमजोर/वंचित वर्गों से होना चाहिए: ₹8 लाख प्रति वर्ष से कम पारिवारिक आय, SC/ST महिलाएं, या 40% अथवा पूर्ण रूप से दिव्यांग (दिव्यांगजन) महिलाएं।",
        "MGNREGA जॉब कार्ड, ई-श्रम कार्ड, BPL राशन कार्ड, PMJAY कार्ड या किसान सम्मान निधि लाभार्थी भी स्वतः पात्र हैं।",
        "केंद्र/राज्य सरकार या सार्वजनिक उपक्रमों (PSU) में नियमित रोजगार में रहने वाली और समान वैतनिक मातृत्व लाभ प्राप्त करने वाली महिलाएं इस योजना से बाहर हैं।",
      ],
    },
    documents: {
      en: [
        "Aadhaar card or an alternative official identity proof.",
        "Mother and Child Protection (MCP) card or RCHI card.",
        "Details of an Aadhaar-mapped bank or post office account for Direct Benefit Transfer.",
        "Eligibility proof document (e.g., Income certificate, BPL card, e-Shram card, or MGNREGA card).",
        "Child birth certificate and child immunization details to claim later installments.",
      ],
      hi: [
        "आधार कार्ड या वैकल्पिक सरकारी पहचान प्रमाण।",
        "MCP कार्ड या RCHI कार्ड।",
        "प्रत्यक्ष लाभ हस्तांतरण (DBT) के लिए आधार-लिंक्ड बैंक या डाकघर खाते का विवरण।",
        "पात्रता प्रमाण दस्तावेज (जैसे आय प्रमाण पत्र, BPL कार्ड, ई-श्रम कार्ड, या MGNREGA कार्ड)।",
        "बाद की किस्तों के दावे के लिए बच्चे का जन्म प्रमाण पत्र और टीकाकरण विवरण।",
      ],
    },
  },
  {
    id: "scheme-05",
    icon: "🧒", name: "Rashtriya Bal Swasthya Karyakram (RBSK)",
    desc: "Free child health screening and early intervention for birth defects and deficiencies.",
    eligibilitySummary: "Children aged 0–18 years in the community",
    officialLink: "https://rbsk.mohfw.gov.in/",
    detailLink: "https://rbsk.mohfw.gov.in/RBSK/aboutusdata",
    eligibility: {
      en: [
        "Targets all children from birth up to 18 years of age residing in the community.",
        "Guarantees free comprehensive screening for the \"4 Ds\": Defects at birth, Diseases, Deficiencies, and Developmental delays, spanning 32 common health conditions.",
        "Newborns (0–6 weeks) are screened at public health delivery points by medical officers and at home by ASHA workers.",
        "Children aged 6 weeks to 6 years enrolled in Anganwadi Centres are actively screened by Mobile Health Teams (MHT).",
        "Older children/adolescents aged 6–18 years in Government and Government-aided schools are similarly covered by Mobile Health Teams.",
        "Any child diagnosed with a covered condition receives early intervention, free treatment, and surgical management (e.g., Cochlear implants) at the tertiary level, free of cost.",
      ],
      hi: [
        "यह कार्यक्रम समुदाय में रहने वाले जन्म से 18 वर्ष तक के सभी बच्चों को लक्षित करता है।",
        "\"4 D\" — जन्म दोष, रोग, कमियां, और विकासात्मक देरी — के लिए मुफ्त व्यापक स्क्रीनिंग की गारंटी देता है, जो 32 सामान्य स्वास्थ्य स्थितियों को कवर करता है।",
        "नवजात शिशुओं (0–6 सप्ताह) की जांच सार्वजनिक स्वास्थ्य केंद्रों पर चिकित्सा अधिकारियों द्वारा और घर पर आशा कार्यकर्ताओं द्वारा की जाती है।",
        "आंगनवाड़ी केंद्रों में नामांकित 6 सप्ताह से 6 वर्ष तक के बच्चों की जांच मोबाइल हेल्थ टीम (MHT) द्वारा सक्रिय रूप से की जाती है।",
        "सरकारी/सरकारी सहायता प्राप्त स्कूलों में 6–18 वर्ष के बड़े बच्चे और किशोर भी मोबाइल हेल्थ टीम द्वारा कवर किए जाते हैं।",
        "किसी स्वास्थ्य स्थिति से निदान बच्चे को शीघ्र हस्तक्षेप सेवाएं, मुफ्त उपचार, और तृतीयक स्तर पर सर्जिकल प्रबंधन (जैसे कॉकलियर इम्प्लांट) पूर्णतः मुफ्त मिलता है।",
      ],
    },
    documents: {
      en: [
        "Aadhaar Card or Birth Certificate of the child (for advanced hospital registration and tracking).",
        "Parents' identity proof and address proof.",
        "Anganwadi enrollment record or School ID card (for children above 6 weeks) to establish institutional mapping.",
        "Medical Referral slip from the Mobile Health Team (MHT) or local Medical Officers for advanced care at District Early Intervention Centers (DEIC).",
      ],
      hi: [
        "बच्चे का आधार कार्ड या जन्म प्रमाण पत्र (उन्नत अस्पताल पंजीकरण और ट्रैकिंग के लिए)।",
        "माता-पिता का पहचान प्रमाण और पता प्रमाण।",
        "6 सप्ताह से अधिक उम्र के बच्चों के लिए आंगनवाड़ी नामांकन रिकॉर्ड या स्कूल आईडी कार्ड।",
        "जिला शीघ्र हस्तक्षेप केंद्र (DEIC) में उन्नत देखभाल के लिए मोबाइल हेल्थ टीम (MHT) या स्थानीय चिकित्सा अधिकारियों द्वारा जारी मेडिकल रेफरल स्लिप।",
      ],
    },
  },
  {
    id: "scheme-06",
    icon: "💉", name: "Mission Indradhanush",
    desc: "Free immunisation drive covering vaccine-preventable childhood diseases.",
    eligibilitySummary: "Unvaccinated or partially vaccinated children and pregnant women",
    officialLink: "https://immunization.mohfw.gov.in/",
    detailLink: "https://www.indiascienceandtechnology.gov.in/st-visions/national-mission/mission-indradhanush-mi",
    eligibility: {
      en: [
        "Core target: all children under 2 years of age who are partially immunized or have never been immunized under the routine Universal Immunization Programme (UIP).",
        "Under expanded phases like Intensified Mission Indradhanush (IMI), on-demand vaccination is extended to children up to 5 years of age during specific drives.",
        "Includes pregnant women who need to be fully immunized (e.g., catching up on missed Tetanus vaccines).",
        "Functions as a broad catch-up initiative ensuring no socio-economic barriers prevent life-saving protection.",
        "Eligible beneficiaries receive free vaccines against Polio, Measles, Hepatitis B, Tetanus, Diphtheria, Tuberculosis, Whooping Cough, Pneumonia, and Japanese Encephalitis.",
      ],
      hi: [
        "मुख्य लक्ष्य समूह: 2 वर्ष से कम उम्र के वे सभी बच्चे जो नियमित सार्वभौमिक टीकाकरण कार्यक्रम (UIP) के तहत आंशिक रूप से टीकाकृत या पूरी तरह से अनटीकाकृत हैं।",
        "गहन मिशन इंद्रधनुष (IMI) जैसे विस्तारित चरणों के तहत, विशेष अभियानों के दौरान मांग पर 5 वर्ष तक के बच्चों को भी कवरेज दिया जाता है।",
        "इसमें वे गर्भवती महिलाएं भी शामिल हैं जिन्हें पूर्ण टीकाकरण की आवश्यकता है (जैसे छूटे हुए टिटनेस के टीके पूरे करना)।",
        "यह एक व्यापक कैच-अप पहल है जो सुनिश्चित करती है कि कोई भी सामाजिक-आर्थिक बाधा जीवन रक्षक सुरक्षा में रुकावट न बने।",
        "पात्र लाभार्थियों को पोलियो, खसरा, हेपेटाइटिस बी, टिटनेस, डिप्थीरिया, टीबी, काली खांसी, निमोनिया और जापानी इंसेफेलाइटिस के विरुद्ध मुफ्त टीके मिलते हैं।",
      ],
    },
    documents: {
      en: [
        "Mother and Child Protection (MCP) card or any previous immunization logbook.",
        "Aadhaar card or parent/guardian identity proof (helpful for maintaining health registries).",
        "Hospital discharge summary or birth certificate of the infant to map out the missed vaccine timeline.",
      ],
      hi: [
        "MCP कार्ड या पूर्व टीकाकरण लॉगबुक।",
        "आधार कार्ड या माता-पिता/अभिभावक का पहचान प्रमाण (स्वास्थ्य रिकॉर्ड बनाए रखने के लिए सहायक)।",
        "छूटे हुए टीकों की समय-सीमा तय करने के लिए अस्पताल डिस्चार्ज समरी या शिशु का जन्म प्रमाण पत्र।",
      ],
    },
  },
];

module.exports = { GOVT_SCHEMES };
