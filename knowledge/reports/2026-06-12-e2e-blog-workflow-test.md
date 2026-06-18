# Báo cáo test E2E — Blog workflow + DevOps pipeline (2026-06-12)

**Mục tiêu:** test 2 workflow (`blog-design-guide.md` của personal-homepage + `devops-workflow.md` của
guideline) bằng cách cho Claude chạy **tự động từ đầu đến cuối** cho chủ đề *CloudFront mTLS to origins*,
làm lại từ đầu, override toàn bộ artifact cũ.

**Chế độ chạy:** autonomous test — các gate G1–G6 và các bước "preview rồi chờ duyệt" được
**tự-duyệt nhưng ghi log lại**. Luật cứng không bao giờ vượt: không `terraform apply/destroy`,
không `git commit/push`, không secret/account-ID trong artifact. Agent định nghĩa flow này:
`personal-homepage/.claude/agents/blog-e2e-runner.md` (tạo mới trong lần chạy này).

---

## 1. Đã chạy workflow như thế nào — từng step

| # | Step | Gate | Việc đã làm | Kết quả |
|---|------|------|-------------|---------|
| 0 | Chuẩn bị | — | Backup repo terraform cũ → `cloudfront-mtls-origins.bak-20260612`, làm trống working tree (giữ `.git`) | Có bản đối chiếu old-vs-new |
| 1 | Practice log (guide Step 2, Solution mode) | "log is done" | Fetch bài AWS blog + AWS docs; **không đọc bản log cũ** (đảm bảo test công bằng); viết lại `2026-04-23-cloudfront-mtls-origins.md` theo cấu trúc Pure Architect | 2.756 từ, 7 section, `status: complete` |
| 2 | Build-hint (guide Step 3.1) | — | `assets/<slug>/build-hint.md` — resources / constraints / open questions | Cầu nối sang repo terraform |
| 3 | `/spec-architect` | **G1** | Đọc build-hint, tự trả lời discovery (lab ap-southeast-1, <$5, self-signed CA, CFN-stack cho provider gap) | `docs/specs/cloudfront-mtls-origin.spec.md`, cost ≈ $0.35/8h |
| 4 | `/init-project` | **G2** | CLAUDE.md, `.mcp.json` (placeholder), `.claude/` copy từ guideline, `.gitignore` (.claude/ + .mcp.json + cert patterns) | Scaffold xong; placeholder chờ người điền |
| 5 | `/iac-implement` | **G3** | Vendor `network` từ `$TF_MODULE_LIB` (+`.provenance`); **author** module `cloudfront_mtls_origin` (ALB mTLS verify + trust store S3 + EC2 nginx SSM-only + CloudFront qua 1 `aws_cloudformation_stack`); `scripts/mint-certs.sh` (EKU validate, shred key); cài CI `iac-scan.yml`; sinh `MODULES.md` cho library (trước đó thiếu). Validate chain: fmt ✓ → validate ✓ → tflint ✓ → checkov 97 pass/15 fail (1 fix thật, còn lại FP/quyết định spec) → trivy 0 sau 4 ignore có justification | Chain sạch. **Plan SKIP — creds invalid** (ghi log G3) |
| 6 | `/infra-review` | **G4** | Workflow song song security + infra + cost (3 agent) + synthesize. *Chạy 3 lần — 2 lần đầu hỏng do bug args, xem mục 2.* Wrap-up: ghi `docs/reviews/dev-singapore-2026-06-12.md`, fix 1 High thật, accept-risk 2 High có hồ sơ (spec §9a) | **GO-WITH-FIXES** — 0C/3H/9M/8L, tiết kiệm ~$22.51/tháng (lever chính: teardown đúng hạn) |
| 7 | `/infra-document` | **G5** | `docs/infrastructure.md` (8 section, ghi rõ *designed-state, chưa apply*), `docs/diagrams/infra.drawio` (12 node/10 edge), `README.md` root | Living doc + diagram + entry point |
| 8 | `/secret-scan` | **G6** | Cài guardrail (`.gitleaks.toml`, `.githooks/pre-push`, `secret-scan.yml` CI); scan betterleaks (lúc đó qua Docker) dir-mode | **CLEAN** — 0 finding; `certs/` chưa tồn tại như kỳ vọng |
| 9 | Enrich log (guide Step 4) | preview | Fold kiến thức as-built từ docs repo terraform vào log (diagram, 4 design decision mới, posture, cost) | Log 13→14 phút đọc |
| 10 | Screenshots (guide Step 5) | — | **SKIP** vì chưa deploy; ghi sẵn `screenshot-checklist.md` 8 mục cho lúc apply thật | Chụp sau khi apply |
| 11 | Blog page (guide Step 6) | preview | `app/blog/cloudfront-mtls-origins/page.tsx` (~3.100 từ, 7 TOC, 8 DecisionBlock) + card listing + diagram PNG render từ mermaid (`mmdc`) làm OG image | Blog page đầu tiên cho bài này |
| 12 | Verify (guide Step 7) | — | `pnpm build` | **PASS**, route prerender OK; lint sạch ở file mới |

Chi phí chạy: ~860k subagent tokens (8 agent tuần tự + 3 lần workflow review), trong đó ~285k
là 2 lần review hỏng vì bug args.

---

## 2. Đã fix những gì — và tại sao

### A. Bug phát hiện TRONG lúc chạy (bắt buộc fix để đi tiếp)

1. **`infra-review.js` — args bị mất trên đường Skill → Workflow.**
   *Hiện tượng:* script đọc `args.path`, nhưng args tới nơi là string → fallback `'.'` → review
   **nhầm repo guideline** một cách im lặng, 2 lần liên tiếp (~285k tokens phí).
   *Fix:* normalize args nhận cả 3 dạng string / JSON-string / object.
   *Tại sao:* lỗi im lặng kiểu này tốn tiền và cho kết quả sai mà không ai biết.

2. **`infra-review.js` — thêm preflight guard (agent haiku nhỏ).**
   *Fix:* trước khi chạy 3 reviewer, check target có file `.tf` không; không có → abort `no-go`
   với message rõ ràng.
   *Tại sao:* chặn vĩnh viễn failure-mode "review nhầm thư mục" — dù args có hỏng kiểu gì đi nữa.

3. **Repo terraform — xung đột version constraint provider (High thật từ G4).**
   *Hiện tượng:* env + module tự viết khai `>= 5.80.0` nhưng module `network` vendored pin
   `>= 6.0.0, < 7.0.0` — Terraform **giao** (intersect) constraint nên floor thật là 6.0.0; comment
   5.80.0 là sai sự thật.
   *Fix:* align env + module authored về `>= 6.0.0, < 7.0.0`, sửa comment; **không đụng** module
   vendored (kỷ luật golden-source).
   *Tại sao:* `versions.tf` sai → kỳ vọng upgrade sai; đây là bug tài liệu-trong-code thật sự.

4. Fix nhỏ trong validate chain: checkov CKV_AWS_135 (`ebs_optimized = true`); 4 entry
   `.trivyignore` đều kèm justification (quyết định spec G1); 1 tflint warning annotate có lý do.

### B. 4 đề xuất sau đánh giá (bạn đã duyệt, đã triển khai)

5. **`init-project` — baseline `.gitignore` mở rộng** (`certs/`, `*.pem`, `*.key`, `.terraform/`,
   `*.tfstate*`; `terraform.tfvars` cố ý KHÔNG ignore theo convention).
   *Tại sao:* bản chạy cũ từng để **private key nằm trên disk trong `certs/`** — gate phải tồn tại
   *trước khi* bất kỳ stage nào sinh ra key material.

6. **`init-project` — preflight AWS creds ở G2** (`aws sts get-caller-identity`, che account ID,
   báo ✅/⚠️ ngay trong summary).
   *Tại sao:* lần chạy này đến tận Stage 3 mới phát hiện creds invalid → biết sớm từ G2 thì người
   dùng chủ động sửa trước.

7. **`infra-review.js` — nhận diện accepted-risks từ spec.** Reviewer đọc mục "Accepted risks"
   trong `docs/specs/*.spec.md`; finding khớp thì vẫn báo nhưng gắn `acceptedRisk: true`; synthesize
   loại khỏi counts/go-no-go/must-fix, liệt kê riêng kèm precondition trước prod.
   *Tại sao:* G4 từng báo lại 2 High vốn là quyết định đã chốt ở G1 — gate nên **re-validate** chứ
   không **re-litigate**.

8. **Cài betterleaks binary v1.4.1** vào `~/.local/bin` (tarball release chính thức — phương án
   tương đương brew trên Ubuntu không sudo; checksum sha256 OK; smoke test 471ms, clean).
   *Tại sao:* bạn ưu tiên binary hơn Docker; lần secret-scan tới sẽ bắt binary ở nhánh ưu tiên 1.

### C. Blog workflow (theo quyết định của bạn)

9. **Guide Step 4 — bỏ `docs/reviews/` khỏi input của enrich** (SKILL.md vốn đã cấm → mâu thuẫn
   tài liệu được giải về phía SKILL.md, có ghi lý do ngay trong guide).
   *Tại sao:* blog đưa **kiến trúc hoàn tất**; review report là tài liệu làm việc của pipeline —
   những gì đáng giữ (accepted risks, posture, cost model) đã nằm trong spec + living doc.

10. **Gỡ framing review khỏi log + blog page** (verdict GO-WITH-FIXES, đếm 0C/3H/9M/8L, "review
    gate/cost review") — giữ lại phần kiến thức thật (accepted risks + precondition, gap
    detective-controls, cost lever). Rebuild `pnpm build` PASS.

11. **Sửa typo điều hướng guide Step 6**: "→ Go to Step 6" (tự trỏ về chính nó) → "→ Go to Step 7"
    (2 chỗ).

### Ghi chú vận hành (đã lưu memory)
Named workflow (`Workflow({name})`) bị **cache từ đầu session** — sửa `.claude/workflows/*.js`
giữa session thì phải gọi bằng `scriptPath` (hoặc restart session) mới ăn bản mới.

---

## 3. Còn gì cần chỉnh / update

**Đã chốt (2026-06-13):** `blog.png` KHÔNG fallback im lặng — thay vào đó là **ràng buộc chuẩn bị
trước khi chạy** `/blog-from-notes`: skill có *asset preflight chặn* (blog.png, diagram PNG export
từ drawio đã review, screenshots nếu có deploy, log `complete`) — thiếu thì STOP và liệt kê việc
cần chuẩn bị; chỉ vượt khi người dùng nói rõ (khi đó card mới dùng SVG cover). Guide Step 6 có
checklist "Prepare BEFORE invoking" tương ứng.

**Chờ bạn quyết → đã chuyển thành TODO (2026-06-13):**
1. Golden source `custom-infrastructure`: module `alb` thiếu `mutual_authentication`/trust store
   nên lần này phải author project-local (lab vẫn **có** ALB chạy mTLS — nó nằm trong module
   tự viết `cloudfront_mtls_origin`, không phải module `alb` của library). Quyết định fold ngược
   vào library hay không được **ghi lại để xem xét sau** tại
   `~/Documents/Devops/terraforms/cloudfront-mtls-origins/TODO.md` (§1), kèm thiết kế đề xuất
   (`enable_mutual_auth = false` default, chỉ fold lát cắt listener mTLS + trust store) và
   khuyến nghị hiện tại: defer đến khi có project thứ 2 cần.

**Việc tay của bạn (không phải sửa workflow)** — đã chép thành checklist trong
`cloudfront-mtls-origins/TODO.md` (§2–§3) để theo dõi tại chỗ:
- Fix AWS creds → điền `.mcp.json` → `./scripts/mint-certs.sh` → `terraform plan` (G3 thật) →
  apply nếu muốn → chụp screenshots theo `screenshot-checklist.md` → thêm Results & Evidence vào blog
  → **teardown cùng ngày**.
- Review `docs/diagrams/infra.drawio` → export `infra.png` → xóa block mermaid tạm trong
  `docs/infrastructure.md` (đúng flow bạn chốt: mermaid chỉ để đối chiếu).
- Browser pass blog (`pnpm dev`): TOC scroll-spy, responsive, dark mode, OG debugger.
- Review + commit 3 repo (mọi thay đổi đang ở working tree, chưa commit); sau khi push bật
  Required cho check `iac-scan` + `secret-scan`; xóa `cloudfront-mtls-origins.bak-20260612`
  khi không cần so sánh nữa.
