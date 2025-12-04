# 1.0.0 (2025-12-04)


### Bug Fixes

* add IMS offline token validation ([#109](https://github.com/adobe/da-admin/issues/109)) ([ba7f961](https://github.com/adobe/da-admin/commit/ba7f961401013e92e41fd03381dff38655a65a7a))
* add more tests for getObject ([#148](https://github.com/adobe/da-admin/issues/148)) ([7055d3c](https://github.com/adobe/da-admin/commit/7055d3cb678545a59ea4921da276741350410cc9))
* add semantic release ([#213](https://github.com/adobe/da-admin/issues/213)) ([86b608d](https://github.com/adobe/da-admin/commit/86b608d5c057778c596b7668321d5161eb4d7ca3))
* build ([51c6255](https://github.com/adobe/da-admin/commit/51c62552009429642df65aaa5588c2f27b5dbe61))
* consistently use 'syncadmin' (no intercaps) ([#198](https://github.com/adobe/da-admin/issues/198)) ([3197624](https://github.com/adobe/da-admin/commit/3197624201ecad6fcc2cec25f6fd96b35c9cb614))
* CopySource needs to be encoded ([#210](https://github.com/adobe/da-admin/issues/210)) ([1ab3fc8](https://github.com/adobe/da-admin/commit/1ab3fc8176c3f302057dbb33a5e95d4a08e92239))
* do not respond a 404 on error ([#184](https://github.com/adobe/da-admin/issues/184)) ([b1d10c8](https://github.com/adobe/da-admin/commit/b1d10c8c59d606c534182cb9b494974c1364d5a7))
* error when copying a file that exists ([#185](https://github.com/adobe/da-admin/issues/185)) ([7215387](https://github.com/adobe/da-admin/commit/7215387ca4093341bceeba27e506174a2346bbd2))
* get handler returns undefined ([#168](https://github.com/adobe/da-admin/issues/168)) ([aa55ce5](https://github.com/adobe/da-admin/commit/aa55ce52f942aae3580302520522ca60acb91cac))
* last modified header for source ([#145](https://github.com/adobe/da-admin/issues/145)) ([edf1de1](https://github.com/adobe/da-admin/commit/edf1de1344ab61b052cf40c41254b20428394e94))
* non-https links in docs ([#190](https://github.com/adobe/da-admin/issues/190)) ([661db82](https://github.com/adobe/da-admin/commit/661db821e9a2cf6fb332310b2e5e5467e2a3b80d))
* only invalidate collab for html documents ([#167](https://github.com/adobe/da-admin/issues/167)) ([71e6a1c](https://github.com/adobe/da-admin/commit/71e6a1c983c24f24e51d5859757c5edf5f693903)), closes [#166](https://github.com/adobe/da-admin/issues/166)
* persist creds ([d5dfed1](https://github.com/adobe/da-admin/commit/d5dfed17a54048c5190dc8ef43235d3878276391))
* pin s3 client version due to problems with DOMParser ([#201](https://github.com/adobe/da-admin/issues/201)) ([1f93628](https://github.com/adobe/da-admin/commit/1f93628b022a1f360f985195039d48e27956bc7f))
* preserve content type when copying ([#182](https://github.com/adobe/da-admin/issues/182)) ([4e83525](https://github.com/adobe/da-admin/commit/4e835252e8e7d05075145a4268eb7da426430f47))
* put/post to source responds with hlx.page / hlx.live ([#209](https://github.com/adobe/da-admin/issues/209)) ([0415ef4](https://github.com/adobe/da-admin/commit/0415ef40a36ebde729185a4df5fbce0cebc9a5b1))
* versioning timestamp for version and document itself ([#144](https://github.com/adobe/da-admin/issues/144)) ([a384662](https://github.com/adobe/da-admin/commit/a384662b6ecd9af80b3ad9ead5fa9b6763ebfcc2))
* **versionsource:** "delegate" permission check to api ([#179](https://github.com/adobe/da-admin/issues/179)) ([04b17f2](https://github.com/adobe/da-admin/commit/04b17f2ccce381d62dbde1f88102efb415d343b2))
* when catching exceptions don't rely on $metadata being set ([#170](https://github.com/adobe/da-admin/issues/170)) ([5e121f0](https://github.com/adobe/da-admin/commit/5e121f0a3a918aa74f41fae67785c41c5ebc474d)), closes [#169](https://github.com/adobe/da-admin/issues/169)


### Features

* add a restore point if body is empty ([#173](https://github.com/adobe/da-admin/issues/173)) ([65cbf32](https://github.com/adobe/da-admin/commit/65cbf321eb45f53cec1b3f604c179659526ed5f3))
* add HTTP conditional request support (If-Match, If-None-Match) ([#187](https://github.com/adobe/da-admin/issues/187)) ([190afd8](https://github.com/adobe/da-admin/commit/190afd8a443ba05a5a12d2a600d5d36cad9a7671))
* do not create a version for binaries ([#211](https://github.com/adobe/da-admin/issues/211)) ([92ea28a](https://github.com/adobe/da-admin/commit/92ea28aba8889be7be013196fcbf405c2fb37a91))
* handle bad requests ([#204](https://github.com/adobe/da-admin/issues/204)) ([5ae63c5](https://github.com/adobe/da-admin/commit/5ae63c52a3571a5a426c3bbee429ade62d4da799))
* handle bad requests ([#214](https://github.com/adobe/da-admin/issues/214)) ([be0dc49](https://github.com/adobe/da-admin/commit/be0dc49e99bf2feabb1db60da838fde7ec6a9a32)), closes [#204](https://github.com/adobe/da-admin/issues/204) [#212](https://github.com/adobe/da-admin/issues/212)
* no version for binaries ([dd98406](https://github.com/adobe/da-admin/commit/dd98406b1b8d272d137c91494cfa1bb610592068))
* preserve content type in versions ([#177](https://github.com/adobe/da-admin/issues/177)) ([5182cd5](https://github.com/adobe/da-admin/commit/5182cd5f06af96795554b29d25fff8dfccf50dd0))
* return last modified for source based on timestamp ([#142](https://github.com/adobe/da-admin/issues/142)) ([2b3454b](https://github.com/adobe/da-admin/commit/2b3454bc76421c1414a7d607edd37a6300e28ce0))
* send shared secret to collab ([#202](https://github.com/adobe/da-admin/issues/202)) ([6636423](https://github.com/adobe/da-admin/commit/66364239c84a6a843097fb1fc640063d6d84a3b1))


### Reverts

* Revert "feat: handle bad requests ([#204](https://github.com/adobe/da-admin/issues/204))" ([#212](https://github.com/adobe/da-admin/issues/212)) ([306fcb5](https://github.com/adobe/da-admin/commit/306fcb5177e881fbe3f72ff4ffecb05065f11e59))
* Revert "Fine grained access control ([#108](https://github.com/adobe/da-admin/issues/108))" ([#118](https://github.com/adobe/da-admin/issues/118)) ([68918ca](https://github.com/adobe/da-admin/commit/68918ca5327499e1910f4cd26effd0e5636334f0))
* Revert "fix: last modified header for source ([#145](https://github.com/adobe/da-admin/issues/145))" ([#147](https://github.com/adobe/da-admin/issues/147)) ([20b1a61](https://github.com/adobe/da-admin/commit/20b1a6180e4fcc7f5142e9b6b27ae272e9502b43))
* Revert "fix: versioning timestamp for version and document itself ([#144](https://github.com/adobe/da-admin/issues/144))" ([#146](https://github.com/adobe/da-admin/issues/146)) ([f626da7](https://github.com/adobe/da-admin/commit/f626da7ec16dea5f52434350fb3b387e93a30b43))
* Revert "Revert "fix: last modified header for source"" ([#149](https://github.com/adobe/da-admin/issues/149)) ([767629c](https://github.com/adobe/da-admin/commit/767629c3dc525bca80829906d6b6db4007c372f2)), closes [#145](https://github.com/adobe/da-admin/issues/145) [#147](https://github.com/adobe/da-admin/issues/147)
