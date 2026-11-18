# Vendored `@devicebasedauth/verify`

Verifies devicebasedauth.org ("DBA") device credentials, DPoP proofs, access tokens and
status lists, and runs the OIDC client used for account linking. HashBin uses it in
`src/auth/dba.js`; see `todo/dba_integration.md`.

- **Source:** `packages/verify/src/*.js` (without the `*.test.js` files) in
  [devicebasedauth.org](https://github.com/curtcox/device-based-auth)
- **Commit:** `a6c0d77` (package version 0.1.0)
- **License:** MIT

**Do not edit these files here.** There is one credential evaluator, shared by DBA, its SDK
and every site that accepts DBA credentials, and it must pass DBA's conformance vectors. Fix
bugs upstream, then refresh by copying the files again and updating the commit above:

```sh
cp ../device-based-auth/packages/verify/src/{credential,grants,index,issuer,jose,site,status-list,verifier}.js src/vendor/devicebasedauth/
git -C ../device-based-auth rev-parse HEAD   # record it above
```

`issuer.js` is only needed by HashBin's tests (they sign credentials with a fake issuer); the
Worker never signs anything.
