// -----------------------------------------------------------------------------
// The release helper (.github/scripts/changelog-release.mjs). The release
// commit is pushed straight to main: what it writes must pass the same
// Prettier check as any pull request.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const changelogPath = fileURLToPath(new URL('../CHANGELOG.md', import.meta.url));

test('the real changelog has an Unreleased section and rolls Prettier-clean', async () => {
  const text = await readFile(changelogPath, 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
  const rolled = rollChangelog(text, '9.8.7', '2026-01-02');
  assert.notEqual(rolled, text);
  assert.match(rolled, /^## \[9\.8\.7\] - 2026-01-02$/m);
  assert.match(rolled, /^\[9\.8\.7\]: https:\/\/github\.com\/prohand\/gladys-wemo\//m);
  const options = { ...(await prettier.resolveConfig(changelogPath)), filepath: changelogPath };
  assert.equal(await prettier.format(rolled, options), rolled);
});

test('rollChangelog moves Unreleased under the version, first release', () => {
  const text = `# Changelog

## [Unreleased]

### Added

- Thing.

[Unreleased]: https://github.com/prohand/gladys-wemo/commits/main
`;
  assert.equal(
    rollChangelog(text, '1.0.1', '2026-01-02'),
    `# Changelog

## [Unreleased]

## [1.0.1] - 2026-01-02

### Added

- Thing.

[Unreleased]: https://github.com/prohand/gladys-wemo/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-wemo/releases/tag/v1.0.1
`,
  );
});

test('an empty Unreleased section still names the version', () => {
  const rolled = rollChangelog('## [Unreleased]\n', '1.0.2', '2026-01-02');
  assert.match(rolled, /## \[1\.0\.2\] - 2026-01-02\n\n- Maintenance release/);
});

test('a mention of the heading in the intro text is not the section', () => {
  // The 1.x release wrote its section inside the intro, which quotes the heading.
  const before =
    '# Changelog\n\nDescribe each change under `## [Unreleased]` as you make it.\n\n' +
    '## [Unreleased]\n\n### Added\n\n- Something new.\n\n' +
    '[Unreleased]: https://example.org/commits/main\n';
  const after = rollChangelog(before, '1.0.0', '2026-10-12');
  assert.match(after, /under `## \[Unreleased\]` as you make it\./);
  assert.match(after, /## \[1\.0\.0\] - 2026-10-12\n\n### Added\n\n- Something new\./);
});

test('a version already in the changelog is not written twice', () => {
  const before = '## [Unreleased]\n\n- Fix.\n\n[Unreleased]: https://example.org/commits/main\n';
  const once = rollChangelog(before, '1.0.0', '2026-10-12');
  assert.equal(rollChangelog(once, '1.0.0', '2026-10-13'), once);
});
