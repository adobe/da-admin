const NAMESPACES = {
  orgs: [
    {
        "name": "adobe",
        "created": "2024-01-09T23:38:05.949Z"
    },
    {
        "name": "geometrixx",
        "created": "2023-11-30T06:04:10.008Z"
    },
    {
        "name": "wknd",
        "created": "2023-11-30T06:04:10.008Z"
    }
  ],
};
const DA_CONFIG = {
  geometrixx: {
    "total": 1,
    "limit": 1,
    "offset": 0,
    "data": [
        {
            "key": "admin.role.all",
            "value": "aparker@geometrixx.info"
        }
    ],
    ":type": "sheet"
  },
  adobe: {
    "total": 1,
    "limit": 1,
    "offset": 0,
    "data": [
        {
            "key": "admin.role.all",
            "value": "notyou@you.com"
        }
    ],
    ":type": "sheet"
  }
};

const env = {
  DA_AUTH: {
    get: (kvNamespace) => {
      return NAMESPACES[kvNamespace];
    }
  },
  DA_CONFIG: {
    get: (name) => {
      const nameConfig = DA_CONFIG[name];
      console.log(nameConfig);
      return nameConfig;
    }
  }
};

export default env;
