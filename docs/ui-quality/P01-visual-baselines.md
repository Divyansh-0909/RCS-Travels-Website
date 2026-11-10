# visual-baselines

AUTHOR: CODEX
PHASE: P01
DATE: 21 October 2026 (Asia/Kolkata)
EVIDENCE SNAPSHOT: 2026-10-21T07:44:01.429Z
GIT BASE: 2ff51e7d9dade932cd21dfe5d836488d4b9a700a

These captures are diagnostic baselines, NOT approved goldens. Do not auto-accept or overwrite reviewed snapshots. Website rendering used the dedicated local synthetic preview with external network blocked. A separate actual Android failure capture is included from the isolated native app. No app-wide native map, safe-area, gesture or keyboard fidelity is certified, and no customer data is included.

Metadata: P01-before-captures.json and P01-after-captures.json contain the Settings Notifications baseline/after pairs at 390 and 1440px in light/dark; P01-audit-captures.json indexes 56 broader 390/1440 captures, actual data-theme, errors, axe targets and the basic overflow probe; P01-viewer-verification.json records interactive viewer/Storybook checks. The pilot has no intended pixel redesign; accessibility names improve screen-reader output while preserving the reviewed composition.

Manually inspected representative Settings light-phone/dark-desktop, Home phone, Outstation desktop and viewer images. Remaining captures are programmatic evidence and still require human visual review. Home phone full-page capture width exceeds the requested viewport (420 vs 390); this is a known issue, not an approved baseline. Light /dev booking fixtures are not proof that their legacy production routes support light mode.

Uploaded screenshot index:

- [P01-after-settings-notifications-dark-1440.png](https://drive.google.com/file/d/18wY2J_5HyCLQNNB6OPg1XvH5jbEOi5mh/view?usp=drivesdk) — SHA-256 4bae3bf860b806b31c1bee240682ee6d370bed6fe11bd6090977fce494ee24d4
- [P01-after-settings-notifications-dark-390.png](https://drive.google.com/file/d/1AWRljbzjAfuZJZvwGjPC5amHLDEgb6Hw/view?usp=drivesdk) — SHA-256 bf93ee5629f999a262dcc2e582cb85dca3ac0886986e1fdd7107f4785c816760
- [P01-after-settings-notifications-light-1440.png](https://drive.google.com/file/d/1OHHDplegzBwMzRxFJRcJ5BALxU_lCsX5/view?usp=drivesdk) — SHA-256 e199622da7893b2fd2dedcac97352c73fef9a0d6f0d24206b09097c75e219f6d
- [P01-after-settings-notifications-light-390.png](https://drive.google.com/file/d/18Jo4CShOPH9eQjZifjNEjCajlu-OeXum/view?usp=drivesdk) — SHA-256 91d6e1c50f9cb3a21f6df4185ced31eb17d47388bdc741d0a771d081b4ccf221
- [P01-audit-Account-dark-1440.png](https://drive.google.com/file/d/1NkumkKoxKkVLzdQyceWR7rBhc2edeJAH/view?usp=drivesdk) — SHA-256 910d488a73f744f7d0d1ff28107a518fe216a83869a0cc9e72c11335d54f15a3
- [P01-audit-Account-dark-390.png](https://drive.google.com/file/d/1VxZ7GujkCfrGn5wuWBbtowv3kMVGx6DO/view?usp=drivesdk) — SHA-256 e9a74955c03ef2aaa0adcfabb2069a48d1090cfc5f5a59a4915d8827f7ec5944
- [P01-audit-Account-light-1440.png](https://drive.google.com/file/d/1Q_COZsd9EQiavK8SAicz9tDYAwxsq7aR/view?usp=drivesdk) — SHA-256 8f5431ab26decbfb2c7ba03a7d106f0ed00c3b4256d96fa791d6533e86f37d7e
- [P01-audit-Account-light-390.png](https://drive.google.com/file/d/1Mz2odAqNp7xmbdyIQGEKhy3XSDWd5zLa/view?usp=drivesdk) — SHA-256 3e8a7dbafa69d4d18f711862f9550d348a2a05cc0214f1a1f361c5fd5679022d
- [P01-audit-Admin-dark-1440.png](https://drive.google.com/file/d/1eDAIfccOTvkijkfP2MMBfkLBjvJNF5W7/view?usp=drivesdk) — SHA-256 eae807bbc3c08f4139b2a7b3d6b729c2e8560ea3b6e01d3af1a30ed697e0cd03
- [P01-audit-Admin-dark-390.png](https://drive.google.com/file/d/1tETKivb8ACZOLhb2nm8F9Ry-Vdr3XPNa/view?usp=drivesdk) — SHA-256 f9615bd2da1e6fe5b2035955656a0b11911b4845ac076d5b13ad2e45ec1b9138
- [P01-audit-Admin-light-1440.png](https://drive.google.com/file/d/1YmdnjYqXfF0E8t6uxebW_snKI3XcfTen/view?usp=drivesdk) — SHA-256 32e2adc64d83748e8bdfbce8f9884bc9b46620740c6e0288b45fc5254d310e05
- [P01-audit-Admin-light-390.png](https://drive.google.com/file/d/1VCFtw082cHLFgtHyWqBd36dlH9QjmMNe/view?usp=drivesdk) — SHA-256 2651bfe74e8811f8e255728e288fc6bce84705a5b05203fab9fe4222c94bb917
- [P01-audit-Booking-form-fixture-dark-1440.png](https://drive.google.com/file/d/1BKfBXffqZZqfDmdmTjIp_nCjF6CeGG9u/view?usp=drivesdk) — SHA-256 288ba5d0374c6a4c0b10efd4ce7c9db901762a0333a1298915242c16a1ca96af
- [P01-audit-Booking-form-fixture-dark-390.png](https://drive.google.com/file/d/1FdneKb1RRAbxv5LqXkMFAclgXeUSUdVx/view?usp=drivesdk) — SHA-256 7407492a7afb67a73f75ae13d5e291815ad705e1fe093b5ea9d073d174f34871
- [P01-audit-Booking-form-fixture-light-1440.png](https://drive.google.com/file/d/1_HF3ZsgYmrOU-B-vFaTl5TC46b_iL5qM/view?usp=drivesdk) — SHA-256 c4cf4e8b0abfe401e7c94ae01259ed1149dc04bc275d918fc17788d95bb1b9a9
- [P01-audit-Booking-form-fixture-light-390.png](https://drive.google.com/file/d/12gYRryfoEj-h6DfqeP65Wiv87lA-KPkF/view?usp=drivesdk) — SHA-256 a3004682ce43f7c67c613a4481043d812d989d02d99b5941e28acc99bed086cc
- [P01-audit-Feedback-states-dark-1440.png](https://drive.google.com/file/d/17gcu8u0lQlxB8L5xIJ5dw9_RETlL0LeD/view?usp=drivesdk) — SHA-256 c95d44d60e63b5fbe5efa3d75f80efd9f916ae70d5507dd6bd19f5c67a00c9f1
- [P01-audit-Feedback-states-dark-390.png](https://drive.google.com/file/d/1gdRbRu9UVC2ZazD5B3vZsdZDf_XVtsvv/view?usp=drivesdk) — SHA-256 5d1b9722b3d5281847d7cc63486f7f6f1a1672005b31b3bb789b0ef301a3b38d
- [P01-audit-Feedback-states-light-1440.png](https://drive.google.com/file/d/1Bm5y2EqQm0DfnJo2GlATIs-8f3zwiKaj/view?usp=drivesdk) — SHA-256 bc8ad33bb8e34d6e50c30002b33641cb47217deb357705fd373cb43cce508407
- [P01-audit-Feedback-states-light-390.png](https://drive.google.com/file/d/19FfdYtZ-_ujqx84-kL6fA7zkjl1UzhKC/view?usp=drivesdk) — SHA-256 2fedd0cb21c5aeb7ce2fecd032b4bc02496018e96bc73b227c81fb199f405c67
- [P01-audit-Grievance-dark-1440.png](https://drive.google.com/file/d/1CkC0m_PadNd3Gb-S9Gj6wS0ydKvauCQh/view?usp=drivesdk) — SHA-256 c32eb04ebbd9475bc41d15eeb4b86ba35ab825a6d073d06e6671d9cc05e6aa36
- [P01-audit-Grievance-dark-390.png](https://drive.google.com/file/d/1dSOlh5sotbgDpf4bFEsW8WGQsRrPgsyC/view?usp=drivesdk) — SHA-256 05b4304021e4380595926a4d169426d70d6c45cf7b1145a8aa55921f29bcd9d1
- [P01-audit-Grievance-light-1440.png](https://drive.google.com/file/d/1VShXc-jE0WRbkVuAdhUL4aeTMJ6AsIzB/view?usp=drivesdk) — SHA-256 0c85e83905f13b588dcf425ec7d453e53a1000dc7a7b5b48f5bf94fd2b86072e
- [P01-audit-Grievance-light-390.png](https://drive.google.com/file/d/1dIbYTJb1Tb8CmzS565AHl9519jf9uhcd/view?usp=drivesdk) — SHA-256 d8c087318f6e9c567a78dc948476d66791f9d1c75d031e9fa111b99edc34041c
- [P01-audit-Help-dark-1440.png](https://drive.google.com/file/d/1wrJLkNm7f8NuY3vuW6TirYn4WMrU9D6k/view?usp=drivesdk) — SHA-256 de9529096c61f5b0d1317caf807273e27ff63b9b0e76e4683465801be3b24c66
- [P01-audit-Help-dark-390.png](https://drive.google.com/file/d/16AYKclVl6vl0BH0egmb7_ktpuG4RjT0r/view?usp=drivesdk) — SHA-256 07590295c9e348c0745aa19be661df71a073712afa1146bfb40d77ab15638c4d
- [P01-audit-Help-light-1440.png](https://drive.google.com/file/d/1RTwYVtH7Dz1X0MEFCV14gySkpz8BzKwY/view?usp=drivesdk) — SHA-256 99db2a93b06fa1bf617f5c495e02dcf6c0b76961108491217e2cf4fed8699d35
- [P01-audit-Help-light-390.png](https://drive.google.com/file/d/1Ip6WJ02QrVZygnX5O_u3KFChlX8KfJPv/view?usp=drivesdk) — SHA-256 ceb97d23f72f0f5100c9a6ca15dff0d4b30fea3f9f40ed6234f0356eefedaab1
- [P01-audit-Home-Landing-dark-1440.png](https://drive.google.com/file/d/1PlmjgGopRJ1djWsfXUQuzXcVNPtghg5_/view?usp=drivesdk) — SHA-256 d7157815932826009c3f30c114bf06727469e9b4bac202e43e9ea954f483d78f
- [P01-audit-Home-Landing-dark-390.png](https://drive.google.com/file/d/13w_P2PlHgLCxbySfl-wQJfB2Go0J0Or-/view?usp=drivesdk) — SHA-256 5a4b3873c09fa1e485fe1664f6604d87dc605f5ed4f2f300f43102a2e97a8685
- [P01-audit-Outstation-dark-1440.png](https://drive.google.com/file/d/1BFQzc3_aHx_gMTJaEaiei_HlafprpcTo/view?usp=drivesdk) — SHA-256 99cb9fe5a7ec2b7906e97de7085128bed891b18b082ac0eefda572ea8992f5c1
- [P01-audit-Outstation-dark-390.png](https://drive.google.com/file/d/1fqb7ZYEMO_UKL94hQXGwz8pEiJK-AJxg/view?usp=drivesdk) — SHA-256 a4822fae7c8586370220381e15a8a24fb8fa30181267264ef5bb162331f5da2a
- [P01-audit-Privacy-dark-1440.png](https://drive.google.com/file/d/1PtDowyCn8y48JRLNBD-kgt_d21QWH8ll/view?usp=drivesdk) — SHA-256 a254be67f21e5c6eed175d3560249ebf8fe9677c842fe6cb95364a909b62d9a0
- [P01-audit-Privacy-dark-390.png](https://drive.google.com/file/d/13HRThbcIkneYU0hBtPTNDRqo4k_cHuuC/view?usp=drivesdk) — SHA-256 67830b4f7ca50d65e779d175f20b74577c0c778304cadbab985b5488862219ff
- [P01-audit-Privacy-light-1440.png](https://drive.google.com/file/d/1h-T3NOalzznpv0XFFEISkYfO4zFZhegD/view?usp=drivesdk) — SHA-256 5298f0b26c89aedf16f909033de02abf6288aedc2c2559dae2ce325812cdabb8
- [P01-audit-Privacy-light-390.png](https://drive.google.com/file/d/1b8-aPIOIP5YWXT53LxXk6G1ZyhS_H09t/view?usp=drivesdk) — SHA-256 5b48ed13f4cdd5656ba7ddf2a80679bc225fa4a12e4fdbc39cd0f54dced72b6a
- [P01-audit-Refunds-dark-1440.png](https://drive.google.com/file/d/1xAEAbZqaHBhM2i3ZXTMFmnsctUP8453_/view?usp=drivesdk) — SHA-256 437653a4060dd0df7a67f8609de21cf59b695da4bebd8e237a30025b63a13622
- [P01-audit-Refunds-dark-390.png](https://drive.google.com/file/d/1z3rBVhEmKIkKYejtxWuilrsYcm8bBAqI/view?usp=drivesdk) — SHA-256 4507e140a0f943469e3ca055b4ad0926dde9e82ba5b07345650dc6dc9ecd3ec0
- [P01-audit-Refunds-light-1440.png](https://drive.google.com/file/d/11WOhKGws4xxGqksFwLuucp9ikUIra210/view?usp=drivesdk) — SHA-256 d3261c2526f6cb5955eda95e29bb205f5a3e29e27a11de582240fd55d17aeae7
- [P01-audit-Refunds-light-390.png](https://drive.google.com/file/d/1SpyK5z84GqzPBVxEDM9hQhjdIaP7dFMM/view?usp=drivesdk) — SHA-256 1ff4059747ae27734d3fed7fa7c66d7f9d0ca1b655a8f052b31deffbcbac8bbf
- [P01-audit-Safety-dark-1440.png](https://drive.google.com/file/d/1efqOSzypG1FLuHsT2DQKqqhFkBv5xU0T/view?usp=drivesdk) — SHA-256 1ac581649211ccdc61e63c2c4f40df40ee9460cccbba533d08bc33742a204684
- [P01-audit-Safety-dark-390.png](https://drive.google.com/file/d/1MaAJjPE7THi78SEVhO7BtO6AF3mLxAKr/view?usp=drivesdk) — SHA-256 1570fcb9d806b7f42516d8a6d2fbc5e98158f256ac725b6442dc2dbfcfe77331
- [P01-audit-Safety-light-1440.png](https://drive.google.com/file/d/1CnBA1vFwo6Z59er1xQTqLmhdHxxuZihP/view?usp=drivesdk) — SHA-256 34fc60248d3eb4d67df6c51855f7b7d8ba028a97eb708cc8692b06c48a5b3ad0
- [P01-audit-Safety-light-390.png](https://drive.google.com/file/d/1JlQN3LVR4P7cX-UkwX-408ZShD-tynqN/view?usp=drivesdk) — SHA-256 2466172f9d78e2b54a7797f791cc92dbe5ab1c8531a9fff073ca7bab80466dfb
- [P01-audit-Settings-dark-1440.png](https://drive.google.com/file/d/1MjVzPxN1GWJkM3AaStOqqgl9bCRrxU4P/view?usp=drivesdk) — SHA-256 74efa2ce29f7c80e3774fbe7edb9ee47d20b8884c873969f687eb4024b667f50
- [P01-audit-Settings-dark-390.png](https://drive.google.com/file/d/1inGF2xF_N0OWCvS4Ao5LRYmDLtnFfVJf/view?usp=drivesdk) — SHA-256 8f2fd99fc8f7edd1408df2bbf7836fc4f2d5dcf51d61ac8654883f4a6d341b1d
- [P01-audit-Settings-light-1440.png](https://drive.google.com/file/d/1gm2IrUVY6kw6BQ1WN1Us_4dUr-hsiXtZ/view?usp=drivesdk) — SHA-256 59a0d1cb31593fda77ddbb5eb74eeb53a101aff3a0686d0d3e3fc9be1ebec101
- [P01-audit-Settings-light-390.png](https://drive.google.com/file/d/1fFfI96yqqUG0uQgT-plP0SrvufuR3H5N/view?usp=drivesdk) — SHA-256 7dbae6148e29347e99af5229a1dbdff6dd95dfb97896fcced860c18be9bc31b0
- [P01-audit-Terms-dark-1440.png](https://drive.google.com/file/d/1iqyE4mI58bpmrclObovMJBCHQFowFdFM/view?usp=drivesdk) — SHA-256 e2df03cfe65201ff4eac6a2a37ddced84acea5147b256b82e699eaa73101f086
- [P01-audit-Terms-dark-390.png](https://drive.google.com/file/d/1Zf8vrGZInIE6Zds1reUFnl0BQ5Lz6tRs/view?usp=drivesdk) — SHA-256 59f9aa739ab11edcce518ffcd4b8f5aaa0601ebee00e20af5965fe5fe2d00e05
- [P01-audit-Terms-light-1440.png](https://drive.google.com/file/d/1g3WXwZIPyTQR691TnCM2gTsLUMO0TFP2/view?usp=drivesdk) — SHA-256 3fc9d38e2d8a1b456dcc90dfe53d343b8833951a8496c783d3b832e30dc99809
- [P01-audit-Terms-light-390.png](https://drive.google.com/file/d/1JtA5Pb3wmD67wjTnipo3QCU9F64JMflI/view?usp=drivesdk) — SHA-256 0a0b0569c14a90888097bc2cfb36b23b880809525e2ec4f227d5d529e16adbec
- [P01-audit-Tracking-fixture-dark-1440.png](https://drive.google.com/file/d/1Tc3uXweYipQkWAaefY2yYDbBbt1eyaW8/view?usp=drivesdk) — SHA-256 82f84507e25e137ff3e22a67b9f63ab54e50e131f5bda0b13329d56ff6cdfacc
- [P01-audit-Tracking-fixture-dark-390.png](https://drive.google.com/file/d/1tseyFPcAqyS3P5GLWfQV0WnXfqWWxjDi/view?usp=drivesdk) — SHA-256 cf668ac540ba73d36beb25cea440d9e81074b16a8136c06327e8f9f77371f5a1
- [P01-audit-Tracking-fixture-light-1440.png](https://drive.google.com/file/d/1BUvd5jGb_8cKvGiRfsnwdXw8wEaTfisi/view?usp=drivesdk) — SHA-256 c3ee5957940d112c1c5a664188c611c7959ceb1ffe56c0e288301735a7df48cc
- [P01-audit-Tracking-fixture-light-390.png](https://drive.google.com/file/d/1Qpmro9--FHiMtS0e0m6wCyrSNnkvdgfm/view?usp=drivesdk) — SHA-256 c60f551f47dbbb313170da13fd52b23a8ca0ee474b476a56dc5802a95e515534
- [P01-audit-Vehicle-select-fixture-dark-1440.png](https://drive.google.com/file/d/1nC7o683uv9aPxbcwf9_9gWqn8gbQrmXz/view?usp=drivesdk) — SHA-256 60416fcf3b8dd946dac862df7c2bbe9fb2229546eed287c5b40db7dded9fd10e
- [P01-audit-Vehicle-select-fixture-dark-390.png](https://drive.google.com/file/d/1YPv1OqeVSWOUc8XP8Wjx6B8gbVtXgz-e/view?usp=drivesdk) — SHA-256 d7307fa5ca1a64a36b9d1b445b0741059f7291ea43c6d52d59e9231db80749a3
- [P01-audit-Vehicle-select-fixture-light-1440.png](https://drive.google.com/file/d/1ykioy2XsG121NA-EkM2AtM-0RTwWUVkh/view?usp=drivesdk) — SHA-256 1fd0e7d01691479fcd04981f6138f8c1e199bcd9b2d64dd9bb253e81149d4a5d
- [P01-audit-Vehicle-select-fixture-light-390.png](https://drive.google.com/file/d/104UmvfIHUwrt-nXuXDb2TNzBg2_yUvri/view?usp=drivesdk) — SHA-256 ec899161ed9fc73d835b0947f30bd97a767a4d7146a57f6819eeea349f89660e
- [P01-before-settings-notifications-dark-1440.png](https://drive.google.com/file/d/17wVC3_GO3melvHKUz2Nu-n5_DOkxSBvu/view?usp=drivesdk) — SHA-256 4bae3bf860b806b31c1bee240682ee6d370bed6fe11bd6090977fce494ee24d4
- [P01-before-settings-notifications-dark-390.png](https://drive.google.com/file/d/1LjTsUhnvyeMWwBqCC_ZFVfpB9GHch68q/view?usp=drivesdk) — SHA-256 bf93ee5629f999a262dcc2e582cb85dca3ac0886986e1fdd7107f4785c816760
- [P01-before-settings-notifications-light-1440.png](https://drive.google.com/file/d/15grXk29o4Qg3a4zFQQpkZHZMFGT7DYDf/view?usp=drivesdk) — SHA-256 e199622da7893b2fd2dedcac97352c73fef9a0d6f0d24206b09097c75e219f6d
- [P01-before-settings-notifications-light-390.png](https://drive.google.com/file/d/1mmALCoeRFPSlBrkm2zXVvMzCx_UI8Acs/view?usp=drivesdk) — SHA-256 91d6e1c50f9cb3a21f6df4185ced31eb17d47388bdc741d0a771d081b4ccf221
- [P01-live-viewer-1920.png](https://drive.google.com/file/d/1geUedHvf5wbJCnSPrMm80rfw6PNKWUMu/view?usp=drivesdk) — SHA-256 a4518626beb177ae78b2faaab284c87e2f781a715f6d7bd11fc3ae93a0d83054
- [P01-live-viewer-390.png](https://drive.google.com/file/d/1PQUkxbertFV23uIox10g4zSF3T-0bpBb/view?usp=drivesdk) — SHA-256 992be8780a886ff3677ec8b56f17a96c0b4bd5cc46a5035b0cdc2664d6f23802
- [P01-native-controlled-acceptance-failure.png](https://drive.google.com/file/d/1D92I6w_OgHpfmoEdBN6y573lNzeCbP2k/view?usp=drivesdk) — SHA-256 b608485e583dbd00056c0883cb8bfed0597a3d259f1f7d8a36f7fe6a2e254776
- [P01-storybook-switches-dark.png](https://drive.google.com/file/d/1nQ9YZ1iPQz1e1Gjo4OFudQW_GfaspQfi/view?usp=drivesdk) — SHA-256 71fd4b9d8a5fef5b7ba0a35bd9c468aebd4822cda94a75f8407203c8fc4fd3e8
- [P01-storybook-switches-light.png](https://drive.google.com/file/d/1bnalUfc_yKeObLrniBkg0KdBB3dXeGq2/view?usp=drivesdk) — SHA-256 2991c44b9a00a39bb038c5f9b8b44834e6454526a591d1c9dc8a15fc00aa9199
