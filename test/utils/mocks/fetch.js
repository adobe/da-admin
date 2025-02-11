const fetch = async (url, opts) => {
  const ok = !opts.headers.get('x-mock-fail');
  const mockAuth = opts.headers.get('Authorization').split(' ').pop();
  const [email, created_at, expires_in] = mockAuth.split(':');

  return {
    ok,
    status: 200,
    json: async () => {
      return {
        email: email,
      };
    },
  };
};

export default fetch;
