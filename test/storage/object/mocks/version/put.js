export async function postObjectVersion(env, daCtx) {
  return 200;
}

export async function putObjectWithVersion(env, daCtx, update, body, guid) {
  return { status: 201, metadata: { id: guid}};
}
