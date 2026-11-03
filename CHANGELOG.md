# Changelog

## [0.2.0](https://github.com/expnn/opencode-insight/compare/v0.1.7...v0.2.0) (2026-11-03)


### Features

* ✨ Initializing the AI Agent ([766b0af](https://github.com/expnn/opencode-insight/commit/766b0afa4d566ec0dca3c79ffe967e590e815c8b))
* Add sidebar stats line and make refresh/overlay-nav width configurable ([45297ee](https://github.com/expnn/opencode-insight/commit/45297ee58ea090c903c316ca96b60ed71352e15e))
* support opencode v2 alongside v1 ([d49bc6e](https://github.com/expnn/opencode-insight/commit/d49bc6ecb3a1cdf50c29d4eabb12e066881f48e6))


### Bug Fixes

* 🐛 Fixed the issue where the overlay could not be disabled in opencode v1.17.14 ([3cda4c9](https://github.com/expnn/opencode-insight/commit/3cda4c93290462893336749c10a4cae7618f4436))

## [0.3.1](https://github.com/expnn/opencode-insight/compare/v0.3.0...v0.3.1) (2026-11-03)


### Bug Fixes

* restore OIDC trusted publishing: the publish workflow no longer passes `registry-url` to `actions/setup-node`, which exported a placeholder `NODE_AUTH_TOKEN` and made npm skip the OIDC exchange (`ENEEDAUTH`/`404`)
* publish only from a release tag ref, so the SLSA provenance npm attaches records the released commit instead of the branch head it was dispatched from
* lower the `@opentui/core` and `@opentui/solid` peer floor to `>=0.4.3`, matching the range the opencode v1 host itself requires
* pin the dev toolchain to `@opentui/core` and `@opentui/solid` 0.4.3 so a local build reproduces the published bundle byte for byte

## [0.3.0](https://github.com/expnn/opencode-insight/compare/v0.2.1...v0.3.0) (2026-09-26)


### Features

* support opencode v2 alongside v1 from one package: `tui()` for v1 and `setup()` for v2, behind per-host adapters in `src/host/`
* migrate the v1 theme tokens to the v2 token set and normalize v1/v2 message shapes in `src/lib/normalize.ts`
* move option parsing into `src/options.ts` (`sidebarRefreshIntervalMs`, `overlayRefreshIntervalMs`, `overlayNavPct`)
* add a dist import guard (`bun run check:imports`) plus parity and unit tests

## [0.2.1](https://github.com/expnn/opencode-insight/compare/v0.2.0...v0.2.1) (2026-07-10)


### Features

* add the sidebar stats line; make the refresh interval and overlay nav width configurable

## [0.2.0](https://github.com/expnn/opencode-insight/compare/v0.1.8...v0.2.0) (2026-07-08)


### Features

* aggregate subagent usage stats into the root session

## [0.1.8](https://github.com/expnn/opencode-insight/compare/v0.1.7...v0.1.8) (2026-07-07)


### Bug Fixes

* Fixed the issue where the overlay could not be disabled in opencode v1.17.14 ([3cda4c9](https://github.com/expnn/opencode-insight/commit/3cda4c93290462893336749c10a4cae7618f4436))

## [0.1.7](https://github.com/urayoru113/opencode-insight/compare/v0.1.6...v0.1.7) (2026-06-17)


### Bug Fixes

* use npm trusted publishing via OIDC ([5cc2e7e](https://github.com/urayoru113/opencode-insight/commit/5cc2e7ed5d212ff66127848176a8b385a8aced82))

## [0.1.6](https://github.com/urayoru113/opencode-insight/compare/v0.1.5...v0.1.6) (2026-06-17)


### Bug Fixes

* use npm publish instead of bun publish ([4d1596d](https://github.com/urayoru113/opencode-insight/commit/4d1596d9cf9e59fb31423e6a14905837ec9ba2fd))

## [0.1.5](https://github.com/urayoru113/opencode-insight/compare/v0.1.4...v0.1.5) (2026-06-17)


### Bug Fixes

* write npmrc in project root for bun publish auth ([6c73e39](https://github.com/urayoru113/opencode-insight/commit/6c73e395ff070a56e8a7aba9baee30a6328d7114))

## [0.1.4](https://github.com/urayoru113/opencode-insight/compare/v0.1.3...v0.1.4) (2026-06-17)


### Bug Fixes

* fix alignment and remove unused code ([1bb5c1a](https://github.com/urayoru113/opencode-insight/commit/1bb5c1a1bb41d715c33e01b2b53bf7e22e53d762))
* TimelinePanel alignment ([818d1dc](https://github.com/urayoru113/opencode-insight/commit/818d1dcd64c3b29cbf989f4a0028a649f3e6ae16))
* use current-session totals in OverviewPanel ([2066f29](https://github.com/urayoru113/opencode-insight/commit/2066f2929f16a9da7b1d35ae88e7cf9467546812))
