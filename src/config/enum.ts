enum BASE_APIS_URL {
  UNSECURED = 'v1/unsecured',
  SECURED = 'v1/secure',
  SWAGGER = 'v1/bo',
}

enum APIS_URL_GLOBAL_PATH {
  USERS = 'users',
  PACKS = 'packs',
  AUTH = 'auth',
  BUILDING = 'building',
  LAND = 'land',
  AGENCY = 'agency',
  COMMON = 'common',
  PERMS = 'perms',
  INVITE = 'invitation',
  TEAM = 'team',
  ANNONCES = 'annonces',
  LEADS = 'leads',
  VISITS = 'visits',
}

enum CLOUDINARY_FOLDER_NAME {
  AGENCY = 'agency',
  LOGO = 'logo',
  DOC = 'documents',
  PROPERTY = 'properties',
  USERS = 'USERS',
  ANNONCE = 'annonces',
  TEMP = 'temporary_files',
}

enum SWAGGER_TAGS {
  USER_MANAGEMENT = 'Users management',
}

enum TOKEN_EXCEPTION {
  TOKEN_INVALID = 101,
  TOKEN_EXPIRED = 102,
  NO_TOKEN = 103,
}

enum EXPIRE_TIME {
  _2_MINUTES = 120,
  _5_MINUTES = 300,
  _15_MINUTES = 900,
  _30_MINUTES = 1800,
  _60_MINUTES = 3600,
  _1_DAY = 86400,
  _2_DAYS = 172800,
  _3_DAYS = 259200,
  _4_DAYS = 345600,
  _5_DAYS = 432000,
  _6_DAYS = 518400,
  _7_DAYS = 604800,
  _8_DAYS = 691200,
  _9_DAYS = 777600,
  _10_DAYS = 864000,
  _11_DAYS = 950400,
  _12_DAYS = 1036800,
  _13_DAYS = 1123200,
  _14_DAYS = 1209600,
  _15_DAYS = 1296000,
  _16_DAYS = 1382400,
  _17_DAYS = 1468800,
  _18_DAYS = 1555200,
  _19_DAYS = 1641600,
  _20_DAYS = 1728000,
  _21_DAYS = 1814400,
  _22_DAYS = 1900800,
  _23_DAYS = 1987200,
  _24_DAYS = 2073600,
  _25_DAYS = 2160000,
  _26_DAYS = 2246400,
  _27_DAYS = 2332800,
  _28_DAYS = 2419200,
  _29_DAYS = 2505600,
  _30_DAYS = 2592000,
}

export {
  TOKEN_EXCEPTION,
  CLOUDINARY_FOLDER_NAME,
  BASE_APIS_URL,
  SWAGGER_TAGS,
  EXPIRE_TIME,
  APIS_URL_GLOBAL_PATH,
};
