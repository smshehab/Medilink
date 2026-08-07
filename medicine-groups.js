const groups = {
  'Gastric & digestion': ['seclo','maxpro','esoral','omidon','rabep','pantonix','sergel','losectil','antacid','gasnil','digestin','domper','emeset','motigut'],
  'Pain, fever & inflammation': ['napa','ace','naprox','voltalin','ketoral','parax','painoff','relief'],
  'Antibiotic & infection': ['cefix','zimax','moxacil','fluclox','ciprocin','flagyl','afix','cef-3','azin','claricin','doxin','levoxin','moxilin','neotack'],
  'Allergy & respiratory': ['histacin','fenadin','fexo','loratin','montair','alatrol','oradin','rupa','tofen','salbut','montel','asthalin','coughnil','tusca','coldrex','sinarest','allerfree'],
  'Heart, blood pressure & diabetes': ['rosuva','clopid','glucovance','amdocal','losucon','telma','bizoran','cardio','sugarnil','bp care'],
  'Vitamins & supplements': ['ceevit','xinc','zinc','vitamin','calcium','b-50','neuro-b','iron','folic','ors','bonecal','immuno','multi vita'],
  'Skin, eye & ENT care': ['flucon','candid','fungin','derma','clotrim','mupi','burn gel','savlon','eye drop','ear drop','nasal spray','skinaid','dermasol'],
  'General health': ['amodis','renacare','livcare','neurocare','jointflex']
};

const medicineGroup = name => {
  const normalized = String(name || '').toLowerCase();
  return Object.entries(groups).find(([, keywords]) => keywords.some(keyword => normalized.includes(keyword)))?.[0] || 'General medicine';
};

module.exports = { medicineGroup };
