# Dependency Audit Report
Generated: 2025-12-15

## Executive Summary

- **Security Issues**: 1 HIGH severity vulnerability (transitive dependency)
- **Outdated Packages**: 9 packages with available updates
- **Unused Dependencies**: 1 package (async-mqtt)
- **Misclassified Dependencies**: 1 package (discord-api-types in devDependencies but used in runtime)

---

## 1. Security Vulnerabilities

### HIGH Severity: jws (transitive dependency of jsonwebtoken)
- **CVE**: CVE-2025-65945
- **CVSS Score**: 7.5
- **Issue**: Improper HMAC signature verification in jws <3.2.3
- **Current Version**: 3.2.2 (via jsonwebtoken 9.0.2)
- **Fix**: Update jsonwebtoken to 9.0.3 which includes jws 3.2.3+
- **Impact**: According to the advisory, users of `jsonwebtoken` (which uses `jws.verify()` interface) are NOT directly affected, but should still update
- **Action**: ✅ **Update jsonwebtoken to 9.0.3 immediately**

---

## 2. Outdated Packages

### Production Dependencies

| Package | Current | Latest Stable | Update Type | Recommendation |
|---------|---------|---------------|-------------|----------------|
| jsonwebtoken | 9.0.2 | 9.0.3 | Patch | **Update immediately** (security fix) |
| dotenv | 16.3.1 | 16.6.1 | Patch | Update (16.x), v17 is major breaking change |
| express | 4.21.2 | 4.22.1 | Patch | Update to 4.22.1, defer v5 migration |

### Dev Dependencies

| Package | Current | Latest Stable | Update Type | Recommendation |
|---------|---------|---------------|-------------|----------------|
| @types/jsonwebtoken | 9.0.4 | 9.0.10 | Patch | Update |
| @types/express | 4.17.14 | 4.17.25 | Patch | Update (stay on v4 types) |
| @types/node | 18.11.0 | 18.19.130 | Patch | Update to 18.19.130 |
| @types/ws | 8.5.3 | 8.18.1 | Patch | Update |
| discord-api-types | 0.37.61 | 0.37.120 | Patch | Update (0.38+ has breaking changes) |
| typescript | 4.8.4 | 4.9.5 | Patch | Update to 4.9.5 (5.x is major update) |

### Major Version Updates (Defer for Now)
- **typescript 5.9.3**: Significant changes, requires thorough testing
- **@types/node 25.x**: Only if upgrading Node.js runtime
- **express 5.x**: Breaking changes, requires code refactoring
- **dotenv 17.x**: Breaking changes in API

---

## 3. Unused Dependencies (Bloat)

### async-mqtt (REMOVE)
- **Status**: ❌ Not imported or used anywhere in the codebase
- **Size**: ~50KB + transitive dependencies (mqtt, etc.)
- **Action**: **Remove completely**
- **Command**: `yarn remove async-mqtt`

---

## 4. Misclassified Dependencies

### discord-api-types
- **Issue**: Listed in `devDependencies` but used in runtime code
- **Location**: `src/services/auth/discord.ts:7`
- **Risk**: Won't be installed in production builds
- **Action**: **Move to dependencies**

---

## 5. Additional Observations

### tsc Package (Questionable)
- The `tsc` package (v2.0.4) in devDependencies is unusual
- TypeScript compiler is normally provided by the `typescript` package
- The standalone `tsc` package appears to be a different project
- **Recommendation**: Remove `tsc` package - `typescript` package already provides tsc binary

---

## Recommended Actions

### Priority 1: Security & Critical Fixes
```bash
# 1. Update jsonwebtoken (security fix)
yarn upgrade jsonwebtoken@^9.0.3

# 2. Remove unused async-mqtt
yarn remove async-mqtt

# 3. Move discord-api-types to production dependencies
yarn remove discord-api-types
yarn add discord-api-types@^0.37.120

# 4. Remove unnecessary tsc package
yarn remove tsc
```

### Priority 2: Update Patch Versions
```bash
# Update all packages to latest patch versions within current major/minor
yarn upgrade dotenv@^16.6.1
yarn upgrade express@^4.22.1
yarn upgrade --dev @types/jsonwebtoken@^9.0.10
yarn upgrade --dev @types/express@^4.17.25
yarn upgrade --dev @types/node@^18.19.130
yarn upgrade --dev @types/ws@^8.18.1
yarn upgrade --dev typescript@^4.9.5
```

### Priority 3: Consider Major Updates (Future Sprint)
- **TypeScript 5.x**: Modern features, better performance
- **Express 5.x**: ESM support, updated APIs
- **Node.js Types**: If upgrading Node runtime

---

## Impact Summary

### Before Cleanup
- Total dependencies: 194
- Security vulnerabilities: 1 HIGH
- Unused dependencies: ~50-100KB wasted

### After Cleanup
- Total dependencies: ~185-190 (removing async-mqtt and its tree)
- Security vulnerabilities: 0
- Properly classified dependencies
- All packages on latest stable patch versions

---

## Estimated Time
- Priority 1 fixes: 15 minutes
- Priority 2 updates: 15 minutes
- Testing: 30 minutes
- **Total**: ~1 hour

## Testing Checklist
After updates:
- [ ] Run `yarn install` successfully
- [ ] Run `yarn build` successfully
- [ ] Run `yarn run` and verify server starts
- [ ] Test authentication endpoints (JWT, Discord OAuth)
- [ ] Run any existing test suite
- [ ] Verify no runtime errors
