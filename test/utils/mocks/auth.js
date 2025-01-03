export default {
  getUsers: () => { return [{ email: 'anonymous' }]; },
  getAclCtx: () => { return { actionSet: new Set() }; },
};
