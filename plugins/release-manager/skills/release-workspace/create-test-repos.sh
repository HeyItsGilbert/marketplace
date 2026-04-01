#!/usr/bin/env bash
# Recreate test repos for the release skill evals.
# Usage: bash create-test-repos.sh [output-dir]
# Default output-dir: ./test-repos

set -euo pipefail
OUT="${1:-./test-repos}"
rm -rf "$OUT"
mkdir -p "$OUT"

# ─── Test Repo 1: Node.js mid-lifecycle ───────────────────────
(
  mkdir -p "$OUT/node-mid-lifecycle" && cd "$OUT/node-mid-lifecycle"
  git init && git config user.email "test@test.com" && git config user.name "Test User"

  cat > package.json << 'EOF'
{
  "name": "my-app",
  "version": "1.2.0",
  "description": "A sample Node.js application",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "jest"
  }
}
EOF
  cat > index.js << 'EOF'
const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(3000);
module.exports = app;
EOF
  cat > CHANGELOG.md << 'EOF'
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-03-01

### Added
- Health check endpoint
- Express server setup

### Fixed
- Corrected port binding on startup

## [1.1.0] - 2026-02-15

### Added
- Initial project scaffolding
- Basic routing support

[1.2.0]: https://github.com/test/my-app/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/test/my-app/releases/tag/v1.1.0
EOF
  git add -A && git commit -m "chore(release): 1.2.0"

  cat > auth.js << 'EOF'
const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
}

module.exports = { authenticate };
EOF
  git add auth.js && git commit -m "feat: add JWT authentication middleware"

  sed -i 's/app.listen(3000);/app.listen(3000, () => { console.log("Server ready"); });/' index.js
  git add index.js && git commit -m "fix: resolve server timeout on startup by adding ready callback"

  cat > utils.js << 'EOF'
function formatError(code, message) {
  return { error: { code, message } };
}

module.exports = { formatError };
EOF
  git add utils.js && git commit -m "feat: add error formatting utility"

  sed -i "s/No token/Authentication required/" auth.js
  git add auth.js && git commit -m "fix: correct misleading error message in auth middleware"
)

# ─── Test Repo 2: PowerShell first release ────────────────────
(
  mkdir -p "$OUT/powershell-first" && cd "$OUT/powershell-first"
  git init && git config user.email "test@test.com" && git config user.name "Test User"

  cat > MyModule.psd1 << 'EOF'
@{
    RootModule        = 'MyModule.psm1'
    ModuleVersion     = '0.0.1'
    GUID              = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    Author            = 'Test User'
    Description       = 'A utility module for managing cloud resources'
    FunctionsToExport = @('Get-CloudResource', 'New-CloudResource', 'Remove-CloudResource')
}
EOF
  cat > MyModule.psm1 << 'EOF'
function Get-CloudResource {
    param([string]$Name)
    Write-Output "Getting resource: $Name"
}
EOF
  git add -A && git commit -m "initial module scaffold"

  cat >> MyModule.psm1 << 'EOF'

function New-CloudResource {
    param(
        [string]$Name,
        [string]$Type,
        [hashtable]$Tags
    )
    Write-Output "Creating resource: $Name of type $Type"
}
EOF
  git add MyModule.psm1 && git commit -m "add New-CloudResource function"

  cat >> MyModule.psm1 << 'EOF'

function Remove-CloudResource {
    param(
        [string]$Name,
        [switch]$Force
    )
    if (-not $Force) {
        Write-Warning "Use -Force to confirm deletion"
        return
    }
    Write-Output "Removing resource: $Name"
}
EOF
  git add MyModule.psm1 && git commit -m "add Remove-CloudResource with safety prompt"

  mkdir -p Tests
  cat > Tests/MyModule.Tests.ps1 << 'EOF'
Describe 'MyModule' {
    It 'Should export Get-CloudResource' {
        Get-Command Get-CloudResource | Should -Not -BeNullOrEmpty
    }
}
EOF
  git add -A && git commit -m "add basic Pester tests"
)

# ─── Test Repo 3: Ambiguous commits, non-standard version ─────
(
  mkdir -p "$OUT/ambiguous-commits/src" && cd "$OUT/ambiguous-commits"
  git init && git config user.email "test@test.com" && git config user.name "Test User"

  cat > package.json << 'EOF'
{
  "name": "data-processor",
  "version": "2.1.0.0",
  "description": "Data processing pipeline",
  "main": "src/index.js"
}
EOF
  cat > src/index.js << 'EOF'
const { transform } = require('./transform');
const { validate } = require('./validate');

function process(data) {
  const valid = validate(data);
  return transform(valid);
}

module.exports = { process };
EOF
  cat > src/transform.js << 'EOF'
function transform(data) {
  return data.map(item => ({
    ...item,
    processed: true,
    timestamp: Date.now()
  }));
}

module.exports = { transform };
EOF
  cat > src/validate.js << 'EOF'
function validate(data) {
  if (!Array.isArray(data)) throw new Error('Input must be array');
  return data.filter(item => item && typeof item === 'object');
}

module.exports = { validate };
EOF
  cat > CHANGELOG.md << 'EOF'
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.1.0] - 2026-02-20

### Added
- Data validation pipeline
- Transform step with timestamps

### Fixed
- Array type checking in validator

## [2.0.0] - 2026-01-10

### Changed
- Complete rewrite of processing engine
- New API surface (breaking)

[2.1.0]: https://github.com/test/data-processor/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/test/data-processor/releases/tag/v2.0.0
EOF
  git add -A && git commit -m "release 2.1.0"

  cat > src/batch.js << 'EOF'
function batchProcess(items, batchSize = 100) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...batch.map(item => ({
      ...item,
      processed: true,
      timestamp: Date.now(),
      batchId: Math.floor(i / batchSize)
    })));
  }
  return results;
}

module.exports = { batchProcess };
EOF
  cat > src/index.js << 'EOF'
const { batchProcess } = require('./batch');
const { transform } = require('./transform');
const { validate } = require('./validate');

function process(data) {
  const valid = validate(data);
  return transform(valid);
}

module.exports = { process, batchProcess };
EOF
  git add -A && git commit -m "updated processing stuff"

  sed -i 's/throw new Error/throw new TypeError/' src/validate.js
  git add src/validate.js && git commit -m "fixed the error thing"

  cat > src/retry.js << 'EOF'
async function withRetry(fn, maxAttempts = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise(r => setTimeout(r, delay * attempt));
    }
  }
}

module.exports = { withRetry };
EOF
  git add src/retry.js && git commit -m "added retry logic"
)

echo "Test repos created in $OUT"
