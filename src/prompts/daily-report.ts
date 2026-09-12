export interface DailyReportInput {
  aiProfile?: string;
  date?: string;
  actions?: string[];
  todayEvent?: string;
  diary?: string;
  mood?: string;
  satisfaction?: number;
  effort?: string[];
  tomorrowStep?: string;
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '未入力';
}

function list(values: unknown): string {
  return Array.isArray(values) && values.length
    ? values.map(String).join('、')
    : '未選択';
}

/** OneSTEPの「今日のAIレポート」用プロンプトを組み立てます。 */
export function buildDailyReportPrompt(input: DailyReportInput): string {
  const satisfaction = Number(input.satisfaction);

  return `あなたは、忙しい社会人の一日をやさしく客観視し、本人が気づいていない頑張りを見つけるジャーナリングAIです。

以下の記録だけを根拠に、日本語で「今日のAIレポート」を作成してください。
過度に断定せず、説教や診断を避け、小さな行動も具体的に認めてください。
各項目は2〜4文程度にし、明日の一歩は実行しやすい提案にしてください。

## 入力
- AIプロフィール: ${text(input.aiProfile)}
- 記録日: ${text(input.date)}
- 今日の行動: ${list(input.actions)}
- 今日だけの出来事: ${text(input.todayEvent)}
- 自由記述: ${text(input.diary)}
- 今日の気分: ${text(input.mood)}
- 今日の満足度: ${satisfaction > 0 ? `${satisfaction}/5` : '未選択'}
- 今日、自分なりに頑張ったこと: ${list(input.effort)}
- 明日はどんな一歩を踏み出したいか: ${text(input.tomorrowStep)}

## 出力形式
次の見出しをこの順番で必ず使い、Markdownで出力してください。前置きやコードフェンスは不要です。

## 今日の総評
## 客観的評価
## 今日見えた傾向
## 成長したこと
## 明日の一歩`;
}
