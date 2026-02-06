export function generateUri(base: string | URL, params: Record<string, any>) {
  const url = new URL(base);

  for (const [key, val] of Object.entries(params)) {
    if (!!val) {
      url.searchParams.set(key, val);
    }
  }

  return url;
}

export async function requestGet<T = any>(uri: string | URL, params: Record<string, any>) {
  const resp = await fetch(generateUri(uri, params));
  const json = await resp.json();
  return json as T;
}

export async function requestPost<T = any>(uri: string | URL, body: Record<string, any>) {
  const resp = await fetch(uri, {
    method: "POST",
    body: new URLSearchParams(body),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
  });
  const json = await resp.json();
  return json as T;
}
