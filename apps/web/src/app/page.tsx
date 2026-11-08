import Link from "next/link";
import { ReviewCreateForm } from "@/components/review-create-form";

export default function HomePage() {
  return (
    <main>
      <section className="panel" style={{ padding: "2.2rem", display: "grid", gap: "1.6rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "start" }}>
          <div style={{ display: "grid", gap: "0.45rem", maxWidth: 820 }}>
            <p style={eyebrowStyle}>AI Review Workbench</p>
            <h1 style={{ margin: 0, fontSize: "clamp(2.2rem, 4.5vw, 3.7rem)", color: "#16212b" }}>
              レビューを作成
            </h1>
            <p style={{ margin: 0, color: "#617488", lineHeight: 1.72 }}>
              スクリーンショットと説明を起点に、UIレビュー、正規化、セキュリティ系入力をまとめて実行できます。
              必要に応じて Figma、Semgrep、ZAP、CodeQL の入力を加え、分析用の実行を作成してください。
            </p>
          </div>
          <Link href="/reviews" style={navLinkStyle}>
            レビュー一覧を見る
          </Link>
        </div>

        <div style={overviewGridStyle}>
          <div style={overviewCardStyle}>
            <p style={smallLabelStyle}>基本入力</p>
            <strong style={overviewTitleStyle}>スクリーンショット起点で開始</strong>
            <p style={overviewTextStyle}>
              タイトル、タグ、メモを付けたうえでスクリーンショットと説明を登録し、比較しやすい実行を残せます。
            </p>
          </div>
          <div style={overviewCardStyle}>
            <p style={smallLabelStyle}>追加入力</p>
            <strong style={overviewTitleStyle}>分析ソースを段階的に追加</strong>
            <p style={overviewTextStyle}>
              Figma、Semgrep、ZAP、CodeQL は必要なものだけ有効化できます。MVP の制約は各セクションで確認できます。
            </p>
          </div>
          <div style={overviewCardStyle}>
            <p style={smallLabelStyle}>出力導線</p>
            <strong style={overviewTitleStyle}>作成後すぐに詳細へ移動</strong>
            <p style={overviewTextStyle}>
              実行が作成されると、そのまま詳細画面へ移動して総評、指摘、成果物を確認できます。
            </p>
          </div>
        </div>

        <ReviewCreateForm />
      </section>
    </main>
  );
}

const eyebrowStyle = {
  margin: 0,
  color: "#4d78c9",
  fontSize: "0.8rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.16em",
  fontWeight: 800
};

const smallLabelStyle = {
  margin: 0,
  color: "#6d8095",
  fontSize: "0.76rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
  fontWeight: 700
};

const navLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "0.82rem 1.08rem",
  borderRadius: 999,
  border: "1px solid rgba(111, 138, 164, 0.14)",
  background: "rgba(255, 255, 255, 0.96)",
  color: "#2f6fed",
  fontWeight: 700,
  textDecoration: "none",
  boxShadow: "0 12px 24px rgba(27, 55, 89, 0.04)"
};

const overviewGridStyle = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
};

const overviewCardStyle = {
  display: "grid",
  gap: "0.55rem",
  padding: "1rem 1.05rem",
  borderRadius: 20,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "linear-gradient(180deg, rgba(248, 251, 255, 0.98), rgba(243, 248, 253, 0.94))",
  boxShadow: "0 12px 24px rgba(27, 55, 89, 0.04)"
};

const overviewTitleStyle = {
  color: "#16212b",
  fontSize: "1rem",
  lineHeight: 1.45
};

const overviewTextStyle = {
  margin: 0,
  color: "#617488",
  lineHeight: 1.66
};
