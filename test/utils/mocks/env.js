const NAMESPACES = {
  'geometrixx-da-props': { "admin.role.all":["aparker@geometrixx.info"] },
  'beagle-da-props': { },
  'orgs': [
    { name: 'geometrixx' },
    { name: 'beagle' },
  ]
};
const DA_CONFIG = {
  'geometrixx': {
    "total": 1,
    "limit": 1,
    "offset": 0,
    "data": [
      {
        "key": "admin.role.all",
        "value": "aPaRKer@Geometrixx.Info"
      }
    ],
    ":type": "sheet"
  }
};

const env = {
  S3_DEF_URL: 'https://s3.com',
  S3_ACCESS_KEY_ID: 'an-id',
  S3_SECRET_ACCESS_KEY: 'too-many-secrets',
  DA_AUTH: {
    get: (kvNamespace) => {
      return NAMESPACES[kvNamespace];
    },
    put: (kvNamespace, value, expObj) => {},
  },
  DA_CONFIG: {
    get: (name) => {
      return DA_CONFIG[name];
    },
    put: (name, value, expObj) => {},
  }
};

export default env;
