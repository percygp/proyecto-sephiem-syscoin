// A0 SPIKE — Privy como proveedor Custom JWT en Convex
// Privy no expone OIDC discovery estándar, pero sí un JWKS endpoint custom.
// Por eso usamos type: "customJwt" en lugar del modo OIDC.
//
// Valores verificados con el JWT real (jwt.io):
//   iss = "privy.io"
//   aud = "cmpqbg1fg008x0cl4gyjwmmtk"
//   alg = "ES256" (curva EC P-256)
export default {
  providers: [
    {
      type: "customJwt",
      issuer: "privy.io",
      applicationID: "cmpqbg1fg008x0cl4gyjwmmtk",
      jwks: "https://auth.privy.io/api/v1/apps/cmpqbg1fg008x0cl4gyjwmmtk/jwks.json",
      algorithm: "ES256",
    },
  ],
};
