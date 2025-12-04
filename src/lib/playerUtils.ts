import { Player } from "@/types/fantasy";

// NBA player ID mapping for headshots
// Using NBA.com CDN pattern: https://cdn.nba.com/headshots/nba/latest/1040x760/{playerId}.png
const PLAYER_IDS: Record<string, string> = {
  // Roster players
  "Jamal Murray": "1627750",
  "Reed Sheppard": "1642355",
  "Saddiq Bey": "1630180",
  "Harrison Barnes": "203084",
  "Naz Reid": "1629675",
  "Cade Cunningham": "1630595",
  "Desmond Bane": "1630217",
  "Kevin Durant": "201142",
  "Kawhi Leonard": "202695",
  "Lauri Markkanen": "1628374",
  "Malik Monk": "1628370",
  "John Collins": "1628381",
  "Jaime Jaquez Jr.": "1630621",
  "Jaime Jaquez Jr": "1630621",
  "Jaime Jaquez": "1630621",
  "Tre Jones": "1630210",
  "Dejounte Murray": "1627749",
  "RJ Barrett": "1629628",
  
  // Free agents from ESPN list
  "Ayo Dosunmu": "1630245",
  "Jeremiah Fears": "1642344",
  "Aaron Nesmith": "1630174",
  "Walker Kessler": "1631117",
  "Obi Toppin": "1630167",
  "Seth Curry": "203552",
  "Sam Merrill": "1630241",
  "Aaron Wiggins": "1630598",
  "Dylan Harper": "1642343",
  "Jonathan Kuminga": "1630228",
  "Isaiah Joe": "1630198",
  "Brandin Podziemski": "1641712",
  "Jaylon Tyson": "1642281",
  "Egor Demin": "1642856",
  "Noah Clowney": "1641707",
  "Dennis Schroder": "203471",
  "Wendell Carter Jr.": "1628976",
  "Max Christie": "1631101",
  "Naji Marshall": "1630230",
  "Tim Hardaway Jr.": "203501",
  "Kevin Huerter": "1628989",
  "Moses Moody": "1630541",
  "D'Angelo Russell": "1626156",
  "Tre Johnson": "1642349",
  "Tari Eason": "1631106",
  "Zaccharie Risacher": "1642342",
  "AJ Green": "1630549",
  "Christian Braun": "1631128",
  "Royce O'Neale": "1626220",
  "Miles McBride": "1630540",
  "Klay Thompson": "202691",
  "Bobby Portis": "1626171",
  "Jock Landale": "1629111",
  "Cam Spencer": "1642348",
  "Tristan da Silva": "1642346",
  "Brandon Williams": "1630544",
  "Derrick Jones Jr.": "1627884",
  "Jordan Clarkson": "203903",
  "Simone Fontecchio": "1630282",
  "Khris Middleton": "203114",
  "Gary Trent Jr.": "1629018",
  "Jalen Smith": "1630188",
  "Jarace Walker": "1641706",
  "Caris LeVert": "1627747",
  "Isaiah Stewart": "1630191",
  "Pelle Larsson": "1641713",
  "Herbert Jones": "1630529",
  "Cam Whitmore": "1641708",
  "Gradey Dick": "1641709",
  "Caleb Love": "1631126",
  "Julian Champagnie": "1630551",
  "Tidjane Salaun": "1642347",
  "Sandro Mamukelashvili": "1630572",
  "Jose Alvarado": "1630631",
  "Isaac Okoro": "1630171",
  "Jordan Goodwin": "1630692",
  "Kyle Filipowski": "1642351",
  "Tyrese Martin": "1631113",
  "Cedric Coward": "1642356",
  "Bryce McGowens": "1631116",
  "Maxime Raynaud": "1642354",
  "Buddy Hield": "1627741",
  "Brice Sensabaugh": "1641723",
  "Quinten Post": "1642353",
  "Tristan Vukcevic": "1642352",
  "Kyle Anderson": "1626224",
  "Corey Kispert": "1630557",
  "Aaron Holiday": "1628988",
  "Jared McCain": "1642345",
  "Danny Wolf": "1642357",
  "Jett Howard": "1641724",
  "Ryan Nembhard": "1642358",
  
  // Popular NBA players
  "LeBron James": "2544",
  "Stephen Curry": "201939",
  "Giannis Antetokounmpo": "203507",
  "Nikola Jokic": "203999",
  "Luka Doncic": "1629029",
  "Joel Embiid": "203954",
  "Jayson Tatum": "1628369",
  "Anthony Davis": "203076",
  "Damian Lillard": "203081",
  "Trae Young": "1629027",
  "Donovan Mitchell": "1628378",
  "Ja Morant": "1629630",
  "Tyrese Haliburton": "1630169",
  "Anthony Edwards": "1630162",
  "Shai Gilgeous-Alexander": "1628983",
  "Devin Booker": "1626164",
  "Bam Adebayo": "1628389",
  "Pascal Siakam": "1627783",
  "Domantas Sabonis": "1627734",
  "Karl-Anthony Towns": "1626157",
  "Jalen Brunson": "1628973",
  "De'Aaron Fox": "1628368",
  "Kyrie Irving": "202681",
  "James Harden": "201935",
  "Paul George": "202331",
  "Jimmy Butler": "202710",
  "Zion Williamson": "1629627",
  "Brandon Ingram": "1627742",
  "CJ McCollum": "203468",
  "Evan Mobley": "1630596",
  "Scottie Barnes": "1630567",
  "Franz Wagner": "1630532",
  "Paolo Banchero": "1631094",
  "Victor Wembanyama": "1641705",
  "Chet Holmgren": "1631096",
  "Alperen Sengun": "1630578",
  "Tyrese Maxey": "1630178",
  "Anfernee Simons": "1629014",
  "Tyler Herro": "1629639",
  "Mikal Bridges": "1628969",
  "OG Anunoby": "1628384",
  "Jalen Williams": "1631114",
  "Coby White": "1629632",
  "Derrick White": "1628401",
  "Austin Reaves": "1630559",
  "Immanuel Quickley": "1630193",
  "Marcus Smart": "203935",
  "Draymond Green": "203110",
  "Brook Lopez": "201572",
  "Myles Turner": "1626167",
  "Jaren Jackson Jr.": "1628991",
  "Mark Williams": "1631109",
  "Ivica Zubac": "1627826",
  "Nic Claxton": "1629651",
  "Kyle Kuzma": "1628398",
  "Keldon Johnson": "1629640",
  "Dillon Brooks": "1628415",
  "Aaron Gordon": "203932",
  "Jerami Grant": "203924",
  "Michael Porter Jr.": "1629008",
  "Michael Porter": "1629008",
  "Andrew Wiggins": "203952",
  "Bradley Beal": "203078",
  "DeMar DeRozan": "201942",
  "Zach LaVine": "203897",
  "Jaylen Brown": "1627759",
  
  // Additional common players
  "Russell Westbrook": "201566",
  "Chris Paul": "101108",
  "Rudy Gobert": "203497",
  "Clint Capela": "203991",
  "Tobias Harris": "202699",
  "Norman Powell": "1626181",
  "Terry Rozier": "1626179",
  "Malcolm Brogdon": "1627763",
  "Spencer Dinwiddie": "203915",
  "Bogdan Bogdanovic": "203992",
  "Jonas Valanciunas": "202685",
  "Nikola Vucevic": "202696",
  "Julius Randle": "203944",
  "DeAndre Ayton": "1629028",
  "Jrue Holiday": "201950",
  "Al Horford": "201143",
  "Robert Williams": "1629057",
  "Kristaps Porzingis": "204001",
  "Jarrett Allen": "1628386",
  "Darius Garland": "1629636",
  "Collin Sexton": "1629012",
  "Cameron Johnson": "1629661",
  "Josh Hart": "1628404",
  "Reggie Jackson": "202704",
  "Kentavious Caldwell-Pope": "203484",
  "PJ Washington": "1629023",
  "Isaiah Hartenstein": "1628392",
  "Daniel Gafford": "1629655",
  "Luguentz Dort": "1629652",
  "Alex Caruso": "1627936",
  "Delon Wright": "1626153",
  "Bruce Brown": "1628971",
  "Grant Williams": "1629684",
  "Precious Achiuwa": "1630173",
  "Onyeka Okongwu": "1630168",
  "Jalen Duren": "1631105",
  "Keegan Murray": "1631099",
  "Bennedict Mathurin": "1631097",
  "Jabari Smith Jr.": "1631095",
  "Jaden Ivey": "1631093",
  "Dyson Daniels": "1631100",
  "Shaedon Sharpe": "1631098",
  "Jeremy Sochan": "1631110",
  "Trey Murphy III": "1630530",
  "Ziaire Williams": "1630533",
  "Jaden McDaniels": "1630183",
  "Amen Thompson": "1641704",
  "Ausar Thompson": "1641703",
  "Scoot Henderson": "1641710",
  "Brandon Miller": "1641711",
  "Bilal Coulibaly": "1641715",
  "Taylor Hendricks": "1641716",
  "Keyonte George": "1641717",
  "Jordan Hawkins": "1641718",
  "Trayce Jackson-Davis": "1641720",
  "Dereck Lively II": "1641714",
  "Cason Wallace": "1641719",
  "GG Jackson": "1641721",
  "Kobe Bufkin": "1641722",
  
  // Extended fantasy-relevant players
  "Monte Morris": "1628420",
  "Shake Milton": "1629003",
  "Lonnie Walker IV": "1629022",
  "Pat Connaughton": "1626192",
  "Grayson Allen": "1628960",
  "Jordan Poole": "1629673",
  "Cam Thomas": "1630560",
  "Day'Ron Sharpe": "1630547",
  "Nic Batum": "201587",
  "Nicolas Batum": "201587",
  "Patty Mills": "201988",
  "Lou Williams": "101150",
  "Eric Gordon": "201569",
  "Joe Harris": "203925",
  "Davis Bertans": "202722",
  "Markelle Fultz": "1628365",
  "Cole Anthony": "1630175",
  "Jalen Suggs": "1630591",
  "RJ Hampton": "1630181",
  "Bol Bol": "1629626",
  "Mo Bamba": "1628964",
  "Wendell Moore Jr.": "1631108",
  "Patrick Williams": "1630172",
  "Deni Avdija": "1630166",
  "Rui Hachimura": "1629060",
  "Bones Hyland": "1630538",
  "Christian Wood": "1626174",
  "Danilo Gallinari": "201568",
  "Bojan Bogdanovic": "202711",
  "Kelly Oubre Jr.": "1626162",
  "Kelly Olynyk": "203482",
  "Mason Plumlee": "203486",
  "Cody Zeller": "203469",
  "Robin Lopez": "201577",
  "Thaddeus Young": "201152",
  "Taj Gibson": "201959",
  "JaVale McGee": "201580",
  "Dwight Howard": "2730",
  "Andre Drummond": "203083",
  "Montrezl Harrell": "1626149",
  "Serge Ibaka": "201586",
  "Nerlens Noel": "203457",
  "Mitchell Robinson": "1629011",
  "Moritz Wagner": "1629021",
  "Richaun Holmes": "1626158",
  "Trey Lyles": "1626168",
  "John Konchar": "1629725",
  "Vince Williams Jr.": "1631246",
  "Jake LaRavia": "1631211",
  "David Roddy": "1631212",
  "Kenneth Lofton Jr.": "1631215",
  "Santi Aldama": "1630583",
  "Xavier Tillman": "1630214",
  "Luke Kennard": "1628379",
  "Marcus Morris": "202694",
  "Markieff Morris": "202693",
  "TJ McConnell": "204456",
  "TJ Warren": "1626145",
  "Andrew Nembhard": "1631111",
  "Jericho Sims": "1630579",
  "Quentin Grimes": "1630537",
  "Donte DiVincenzo": "1628978",
  "Deuce McBride": "1630540",
  "Josh Green": "1630182",
  "Maxi Kleber": "1628467",
  "Dwight Powell": "203939",
  "Jaden Hardy": "1631207",
  "Dante Exum": "203957",
  "AJ Lawson": "1630639",
  "Olivier-Maxence Prosper": "1641725",
  "Derrick Jones": "1627884",
  "P.J. Washington": "1629023",
  "Nick Richards": "1630208",
  "Brandon Boston Jr.": "1630527",
  "JaMychal Green": "203210",
  "Terance Mann": "1629611",
  "Peyton Watson": "1631210",
  "Zeke Nnaji": "1630192",
  "Reggie Bullock": "203493",
  "Dorian Finney-Smith": "1627827",
  "Joe Ingles": "204060",
  "Lamar Stevens": "1630205",
  "Max Strus": "1629686",
  "Caleb Martin": "1628997",
  "Duncan Robinson": "1629130",
  "Haywood Highsmith": "1629312",
  "Nikola Jovic": "1631107",
  "Josh Richardson": "1626196",
  "Ish Smith": "202397",
  "Tre Mann": "1630543",
  "Jalen Johnson": "1630552",
  "De'Andre Hunter": "1629631",
  "Kobe Johnson": "1642359",
  "Vit Krejci": "1630249",
  "Mouhamed Gueye": "1641726",
  "AJ Griffin": "1631104",
  "Ousmane Dieng": "1631102",
  "Jaylin Williams": "1631112",
  "Kenrich Williams": "1629026",
  "Lindy Waters III": "1630694",
  "Aleksej Pokusevski": "1630197",
};

// Normalize player name for lookup (handle variations)
function normalizePlayerName(name: string): string {
  return name.trim()
    .replace(/\s+/g, ' ')
    .replace(/jr\.?$/i, 'Jr.')
    .replace(/sr\.?$/i, 'Sr.')
    .replace(/iii$/i, 'III')
    .replace(/ii$/i, 'II');
}

export function getPlayerPhotoUrl(playerName: string, size: 'small' | 'medium' | 'large' = 'medium'): string {
  const normalizedName = normalizePlayerName(playerName);
  
  // Try exact match first
  let playerId = PLAYER_IDS[normalizedName];
  
  // Try without Jr./Sr. suffix
  if (!playerId) {
    const withoutSuffix = normalizedName.replace(/\s+(Jr\.|Sr\.|III|II)$/i, '');
    playerId = PLAYER_IDS[withoutSuffix];
  }
  
  // Try with Jr. suffix if not present
  if (!playerId && !normalizedName.includes('Jr.')) {
    playerId = PLAYER_IDS[normalizedName + ' Jr.'];
  }
  
  if (playerId) {
    // NBA.com CDN
    const dimensions = size === 'small' ? '260x190' : size === 'medium' ? '1040x760' : '1040x760';
    return `https://cdn.nba.com/headshots/nba/latest/${dimensions}/${playerId}.png`;
  }
  
  // Fallback to placeholder
  return '/placeholder.svg';
}

export function getPlayerInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function formatStat(value: number | undefined, format: 'pct' | 'num' | 'decimal' = 'num'): string {
  if (value === undefined || value === null || isNaN(value)) return '--';
  
  switch (format) {
    case 'pct':
      return value < 1 ? `.${Math.round(value * 1000).toString().padStart(3, '0')}` : `${value.toFixed(1)}%`;
    case 'decimal':
      return value.toFixed(1);
    default:
      return value % 1 === 0 ? value.toString() : value.toFixed(1);
  }
}

export function calculatePlayerScore(player: Player): number {
  // Fantasy value score based on 9-cat impact
  const fgImpact = (player.fgPct - 0.45) * 100 * 2;
  const ftImpact = (player.ftPct - 0.75) * 100 * 1.5;
  
  return (
    player.points * 1 +
    player.rebounds * 1.2 +
    player.assists * 1.5 +
    player.steals * 3 +
    player.blocks * 3 +
    player.threepm * 1.2 -
    player.turnovers * 1 +
    fgImpact +
    ftImpact
  );
}

export function getStatusColor(status?: string): string {
  switch (status) {
    case 'O':
    case 'IR':
      return 'text-stat-negative';
    case 'DTD':
      return 'text-stat-neutral';
    case 'SUSP':
      return 'text-stat-negative';
    default:
      return 'text-stat-positive';
  }
}

export function parsePositions(posString: string): string[] {
  if (!posString) return [];
  return posString
    .replace(/[^A-Z,\/]/gi, '')
    .split(/[,\/]/)
    .filter(p => p.length > 0)
    .map(p => p.trim().toUpperCase());
}

export function normalizeTeamCode(team: string): string {
  const teamMap: Record<string, string> = {
    'NO': 'NOP',
    'SA': 'SAS',
    'NY': 'NYK',
    'GS': 'GSW',
    'PHO': 'PHX',
    'UTAH': 'UTA',
    'WSH': 'WAS',
  };
  
  const upper = team.toUpperCase().trim();
  return teamMap[upper] || upper;
}
