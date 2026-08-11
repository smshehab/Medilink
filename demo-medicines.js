const { medicineGroup } = require("./medicine-groups");

// Medicine name, price per strip (BDT), expiry date (DD-MM-YYYY).
// Kept separately so the same demo inventory can be used by the seed command.
module.exports = `
Napa 500|40|05-09-2026
Ace 500|38|18-09-2026
Seclo 20|95|28-09-2026
Maxpro 20|110|10-10-2026
Monas 10|180|20-10-2026
Ceevit|35|05-11-2026
Histacin|28|18-11-2026
Fenadin 120|180|30-11-2026
Amodis 400|55|15-12-2026
Omidon 10|75|28-12-2026
Napa Extend|80|15-01-2027
Esoral 40|210|30-01-2027
Rosuva 10|260|20-02-2027
Clopid AS|320|12-03-2027
Glucovance|340|28-03-2027
Amdocal|145|15-04-2027
Losucon|190|25-04-2027
Telma 40|170|10-05-2027
Bizoran 5|155|28-05-2027
Xinc B|65|12-06-2027
Cefix 200|380|25-06-2027
Zimax 500|420|18-07-2027
Moxacil 500|280|30-07-2027
Fluclox|240|15-08-2027
Ciprocin 500|160|28-08-2027
Flagyl 400|85|15-09-2027
Fexo 120|220|30-09-2027
Loratin|95|15-10-2027
Montair 10|185|28-10-2027
Alatrol|45|12-11-2027
Oradin|55|25-11-2027
Ace Plus|42|10-12-2027
Naprox|150|28-12-2027
Voltalin|280|20-01-2028
Rabep 20|195|15-02-2028
Pantonix|180|28-02-2028
Sergel 20|165|12-03-2028
Losectil|120|30-03-2028
Rupa|90|18-04-2028
Tofen|110|30-04-2028
Afix 200|390|15-05-2028
Cef-3|410|28-05-2028
Azin|430|10-06-2028
Claricin|520|30-06-2028
Doxin|180|15-07-2028
Levoxin|650|30-07-2028
Moxilin|750|15-08-2028
Neotack|270|28-08-2028
Ketoral|120|10-09-2028
Flucon|260|30-09-2028
Candid|95|15-10-2028
Fungin|160|28-10-2028
Zinc Plus|70|12-11-2028
Vitamin C|45|30-11-2028
Vitamin D|180|15-12-2028
Calcium-D|220|28-12-2028
B-50|120|10-01-2029
Neuro-B|95|30-01-2029
Iron Plus|180|15-02-2029
Folic|45|28-02-2029
ORS|35|10-03-2029
Antacid|85|30-03-2029
Gasnil|95|15-04-2029
Digestin|145|28-04-2029
Loper|60|10-05-2029
Domper|90|30-05-2029
Emeset|150|15-06-2029
Motigut|120|28-06-2029
Salbut|110|10-07-2029
Montel|185|30-07-2029
Asthalin|95|15-08-2029
Derma|160|28-08-2029
Clotrim|140|10-09-2029
Mupi|210|30-09-2029
Burn Gel|180|15-10-2029
Savlon Cream|120|28-10-2029
Eye Drop A|170|10-11-2029
Eye Drop B|220|30-11-2029
Ear Drop|150|15-12-2029
Nasal Spray|280|28-12-2029
Parax|42|10-01-2030
Painoff|90|30-01-2030
Relief Plus|140|15-02-2030
Coughnil|160|28-02-2030
Tusca|180|10-03-2030
Coldrex|150|30-03-2030
Sinarest|120|15-04-2030
Allerfree|130|28-04-2030
Skinaid|210|10-05-2030
Dermasol|180|30-05-2030
Renacare|320|15-06-2030
Livcare|290|28-06-2030
Cardio 75|350|10-07-2030
Sugarnil|280|30-07-2030
BP Care|240|15-08-2030
Neurocare|390|28-08-2030
Jointflex|310|10-09-2030
Bonecal|260|30-09-2030
Immuno Plus|450|15-10-2030
Multi Vita|280|28-10-2030`
  .trim()
  .split("\n")
  .map((row) => {
    const [brandName, unitPrice, displayExpiry] = row.split("|");
    const [day, month, year] = displayExpiry.split("-");
    return {
      brandName,
      unitPrice: Number(unitPrice),
      expiryDate: `${year}-${month}-${day}`,
      category: medicineGroup(brandName),
    };
  });
