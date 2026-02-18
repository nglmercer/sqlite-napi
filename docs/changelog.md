=== v0.38.0 ===

## What's Changed

- bump sqlcipher to 4.10.0 (sqlite 3.50.4) #1725
- Use CARGO_CFG_TARGET_FEATURE for crt-static check #1737
- Disable u64, usize ToSql/FromSql impl by default #1732, ##1722 (breaking change)
- Make statement cache optional #1682, #1173 (breaking change)
- Remove shell scripts from the published package #1744
- Use new interfaces with 64-bit length parameters #1749
- sqlite3_vtab_rhs_value #1753
- Handle VTab IN values #1754
- Give access to Connection from VTabCursor::column #1755
- Bump minimal SQLite version to 3.34.1 #1733, #1731 (breaking change)
- Bump bundled SQLite version to 3.51.1 #1758
- Add support for transaction to the vtab module #1761
- Check Connection is owned when registering Closure as hook #1764 (breaking change)
- Turn libsqlite3-sys in a !#[no_std] crate #1767
- Add `wasm32-unknown-unknown` support #1769, #488, #827
- Remove useless Send/Sync on Module #1774

**Full Changelog**: https://github.com/rusqlite/rusqlite/compare/v0.37.0...v0.38.0

=== v0.37.0 ===

## What's Changed

- Add `FromSqlError::other` convenience conversion #1703
- Fix warnings #1705
- Update bindgen requirement from 0.71 to 0.72 #1707
- Fix for vtab::parameter parsing #1712
- Fix clippy warning #1713
- Bump bundled SQLite version to 3.50.2 #1714
- Fix issue with prettyplease #1717

**Full Changelog**: https://github.com/rusqlite/rusqlite/compare/v0.36.0...v0.37.0

=== v0.36.0 ===

## What's Changed

- Introduce Name trait to support both &str and &CStr as name #1659
- Use doc_auto_cfg #1683
- Feature `loadable_extension` is incompatible with some other features #1686
- Add missing wrappers for sqlite3_vtab_nochange and sqlite3_value_nochange #1688
- Update bindings list #1689
- Homogenize code related to hooks #1690
- Try to increase code coverage #1610
- Bump bundled SQLite version to 3.49.2 #1691
- Add bindings to sqlite3_table_column_metadata #1692
- Add bindings to sqlite3_vtab_distinct #1695
- Fix clippy warning #1697
- Add query_one #1699
- Refactor one_column test method #1700

**Full Changelog**: https://github.com/rusqlite/rusqlite/compare/v0.35.0...v0.36.0

=== v0.35.0 ===

## What's Changed

- Document 'rusqlite-macros' and 'jiff' features #1663
- access column metadata from prepared statement #1672 / #1666
- add support for Jiff's `Timestamp` #1676
- Breaking change: Check that Connection::execute has no tail #1679 / #397
- Breaking change: Check for multiple statements in prepare #1680 / #1147

**Full Changelog**: https://github.com/rusqlite/rusqlite/compare/v0.34.0...v0.35.0

=== v0.34.0 ===

## What's Changed

- Find the system library with minimum version 3.14.0 #1628
- Update error type for `ValueRef` methods #1629
- Use decrement_strong_count directly for Array #1633
- Dedup free_boxed_value #1635
- Bump jiff version #1645
- Deserialize impls #1646
- Introduce BindIndex trait #1649
- Use BindIndex in bind_parameters_named #1651
- Improve flexibility of named params #1652
- Use std::ffi instead of std::os::raw #1653
- Bump bundled SQLite version to 3.49.1 #1654
- update LICENSE #1655

**Full Changelog**: https://github.com/rusqlite/rusqlite/compare/v0.33.0...v0.34.0

=== v0.33.0 ===

## What's Changed

- Remove lazy_static dependency #1550
- Add support to jiff Date / DateTime / Time #1551
- Correcting inconsistent parameter name (:value/:val) in doctest example #1555
- Repairing description comment of params! macro #1557
- Try to improve test coverage by using --all #1491
- `impl FromSql` for various heap-allocated string and blob slices #1558
- Document an alternative way to backup #1562
- Use #[expect(lint)] where possible #1563
- chore: update sqlcipher → `4.6.1` (SQLite `3.46.1`) #1566
- Remove leftover sentence beginning #1571
- Improve loadable extension docs #1529
- Fixed pre-release `wasm32-wasip(\d)` targets not enabling wasi compile flags in `bundled` mode. #1569
- MSRV #1576
- Fix Batch impl #1583
- Test invalid batch #1584
- Mark bindgen-bindings files as generated #1585
- Add 'serialize' feature to 'modern-full' #1586
- Change FnMut to Fn in create_scalar_function #1387
- Add safe binding to sqlite3_wal_hook #1594
- Use C string literal for database name #1596
- Make possible to checkpoint a database from `wal_hook` #1595
- Add bindings to sqlite3_trace_v2 #1597
- OwningRows / OwningStatement examples #1462
- Use sqlite3_errstr #1606
- Check if specified `arg` is out-of-range for auxiliary data #1607
- Remove release_memory feature #1608
- Check limit #1609
- Introduce err macro #1611
- Update bindgen requirement from 0.70 to 0.71 #1612
- Bump hashlink version to 0.10 #1616
- Activate generate_cstr bindgen option #1620
- Bump bundled SQLite version to 3.48.0 #1623

**Full Changelog**: https://github.com/rusqlite/rusqlite/compare/v0.32.1...v0.33.0

=== v0.32.1 ===

## What's Changed

- Fix clippy warnings #1542
- Prevent interrupt from non-owned connection #1548
- Test direct-minimal-versions #1549

**Full Changelog**: https://github.com/rusqlite/rusqlite/compare/v0.32.0...v0.32.1

=== v0.32.0 ===

## What's Changed

- Remove obsolete codes and comments #1458
- expose `total_changes()` #1461
- Fix `RawStatement#clear_bindings` #1465
- Add binding to `sqlite3_is_interrupted` #1468
- Use `CStr::to_str` where possible #1470
- Add binding to `sqlite3_db_name` #1471
- Fix `Connection::db_name` #1476
- Omit UTF-16 API #1478
- Omit API #1479
- Fix test_busy_handler #1480
- Remove test_busy_timeout #1481
- Add test to `Connection::backup/restore` #1482
- Use C-string literals #1483
- Activate `SQLITE_OPEN_EXRESCODE` by default #1485
- Respect missing values in session's conflict #1230
- Add bindings to automatic extension loading API #1487
- Remove `Ref/UnwindSafe` constraint on FFI callback #1488
- Check callbacks lifetime #1052
- Use `catch_unwind` in `init_auto_extension` #1489
- Add `preupdate` hook #1486, #897
- Improve test coverage #1490
- Improve `Connection::extension_init2` #1494
- Bump sqlcipher version to v4.5.7 #1504
- Fix parsing of virtual table parameters #1506
- Bump bundled SQLite version to 3.46.0 #1508
- fix: build should support lib64 dir for OpenSSL3.x #1502
- chore: fix some comments #1515
- Applied some spellchecker suggestions #1531
- Allow setting default connection transaction behavior #1532
- Bump sqlite3-parser version #1538

**Full Changelog**: https://github.com/rusqlite/rusqlite/compare/v0.31.0...v0.32.0

=== v0.31.0 ===

## What's Changed

- Check sqlite3_reset result #1419
- Improve wasm32-wasi support #1332
- test_from_handle fails to build on systems with unsigned c_char #1420
- Fix features required by loadable_extension example #1426
- Fix bind macro #1427
- Fix uninlined_format_args #1428
- Remove modern_sqlite and vtab from CI in loadable ext #1429
- Add `#[derive(Clone, Copy...` on all bitflags #1396
- Use DLL_PREFIX / DLL_SUFFIX #1431
- Add missing doc for new features #1434
- Upgrade to hashlink 0.9 #1435
- Drop winsqlite3 feature #1433
- Expose the include directory of the bundled sqlite version #1441
- Bump bundled SQLite version to 3.45.1 #1445
- Fix a few typos #1446
- Make possible to specify subtype of SQL function #1160

**Full Changelog**: https://github.com/rusqlite/rusqlite/compare/v0.30.0...v0.31.0

=== v0.30.0 ===

## What's Changed

- Fix sqlite3_auto_extension xEntryPoint signature #1310
- Use track_caller for panicking methods #1314
- Force linking against system sqlite libs #1317
- fix compilation for target wasm32-wasi #1321
- Add SQLITE_MAX_COLUMN compile-time option #1324
- Upgrade http links to https in Cargo.toml #1330
- Update fallible-iterator requirement from 0.2 to 0.3 #1334
- Implement FromSql & ToSql for std::num::NonZero types #1313
- Add new constants introduced by SQLite 3.42.0 #1336
- Use SQLITE_PREPARE_PERSISTENT for CachedStatement #1339
- Fix type of SQLITE*DESERIALIZE*_, SQLITE*PREPARE*_, SQLITE*SERIALIZE*\* #1340
- Introduce to_sqlite_error #1345
- remove depth from Savepoint #1327
- Savepoint Drop bug #1347
- [breaking change] Update edition from 2018 to 2021 #1267
- Remove msrv for clippy by #1351
- Tweak bindgen #1352, #1353
- Inline constraint_error_code #1359
- Simplify bindgen generation #1360
- Fixes generate_series to handle NULL arguments #1357
- Factorize code in build.rs #1361
- Serialize and deserialize database #1341
- Spelling and a few more nits #1373
- Implement support for more `time` types #1374
- Fix visibility of TransactionState #1384
- Column is used only with column_decltype feature #1385
- Use proper var names in trait definition #1398
- Fix clippy warning: arc_with_non_send_sync - interrupt_lock #1400
- Captured identifiers in SQL strings #1346
- Add new constants introduced by SQLite 3.43.0 #1405
- Make WindowAggregate::value pass mutable value ref #1395
- Bump bundled SQLite version to 3.44.0 #1409
- Bump bindgen version to 0.69 #1410
- Loadable extension #1362

## New Contributors

- @icp1994 made their first contribution in https://github.com/rusqlite/rusqlite/pull/1317
- @wasm-forge made their first contribution in https://github.com/rusqlite/rusqlite/pull/1321
- @nopjia made their first contribution in https://github.com/rusqlite/rusqlite/pull/1324
- @Benjins-automation made their first contribution in https://github.com/rusqlite/rusqlite/pull/1330
- @itsxaos made their first contribution in https://github.com/rusqlite/rusqlite/pull/1313
- @Taywee made their first contribution in https://github.com/rusqlite/rusqlite/pull/1327
- @davidselassie made their first contribution in https://github.com/rusqlite/rusqlite/pull/1357
- @nyurik made their first contribution in https://github.com/rusqlite/rusqlite/pull/1373
- @nydrani made their first contribution in https://github.com/rusqlite/rusqlite/pull/1374

**Full Changelog**: https://github.com/rusqlite/rusqlite/compare/v0.29.0...v0.30.0
