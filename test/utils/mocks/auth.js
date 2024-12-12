export default {
  getUsers: () => { return [{ email: 'anonymous' }]; },
  getAclCtx: () => { return {}; },
  isAuthorized: () => { return false; }
};
