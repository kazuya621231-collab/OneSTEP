export interface JournalRecordInput {
  aiProfile?: unknown;
  date?: string;
  actions?: string[];
  todayEvent?: string;
  diary?: string;
  mood?: string;
  satisfaction?: number;
  effort?: string[];
  tomorrowStep?: string;
}

export type ReportType = 'daily' | 'weekly' | 'monthly';

export interface ReportRequestInput extends JournalRecordInput {
  reportType?: ReportType;
  records?: JournalRecordInput[];
}

const REPORT_HEADINGS: Record<ReportType, string[]> = {
  daily: ['今日の総評', '客観的評価', '今日見えた傾向', '成長したこと', '明日の一歩'],
  weekly: ['今週の総評', '今週頑張ったことTOP3', '繰り返し見られた行動', '気分・満足度の変化', '来週へのアドバイス'],
  monthly: ['今月の総評', '成長したこと', '習慣化できたこと', '課題', '来月への提案']
};

function text(value: unknown, maxLength = 1500): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : '未入力';
}

function list(values: unknown): string {
  return Array.isArray(values) && values.length ? values.map(String).join('、') : '未選択';
}

function formatAiProfile(profile: unknown): string {
  if (typeof profile === 'string') return text(profile, 3000);
  if (!profile || typeof profile !== 'object') return '未設定';

  const labels: Record<string, string> = {
    personality: '性格',
    values: '価値観',
    job: '仕事',
    occupation: '仕事',
    goals: '目標',
    goal: '目標',
    importantThings: '大切にしていること',
    priorities: '大切にしていること'
  };

  const lines = Object.entries(profile as Record<string, unknown>)
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .map(([key, value]) => {
      const formattedValue = Array.isArray(value)
        ? value.map(String).join('、')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
      return `- ${labels[key] || key}: ${text(formattedValue, 800)}`;
    });

  return lines.length ? lines.join('\n') : '未設定';
}

function serializeRecord(record: JournalRecordInput): string {
  const satisfaction = Number(record.satisfaction);
  return [
    `記録日: ${text(record.date)}`,
    `今日の行動: ${list(record.actions)}`,
    `今日だけの出来事: ${text(record.todayEvent)}`,
    `自由記述: ${text(record.diary)}`,
    `今日の気分: ${text(record.mood)}`,
    `今日の満足度: ${satisfaction > 0 ? `${satisfaction}/5` : '未選択'}`,
    `頑張ったこと: ${list(record.effort)}`,
    `明日の一歩: ${text(record.tomorrowStep)}`
  ].join('\n');
}

/** 日次・週次・月次で共通利用するOneSTEPの分析プロンプトです。 */
export function buildReportPrompt(input: ReportRequestInput): string {
  const reportType: ReportType = input.reportType === 'weekly' || input.reportType === 'monthly'
    ? input.reportType
    : 'daily';
  const records = input.records?.length ? input.records : [input];
  const periodName = reportType === 'daily' ? '今日' : reportType === 'weekly' ? '今週' : '今月';
  const headings = REPORT_HEADINGS[reportType].map(heading => `## ${heading}`).join('\n');

  return `あなたは、忙しい社会人の一日をやさしく客観視し、本人が気づいていない頑張りを見つけるジャーナリングAIです。

以下のAIプロフィールと保存済み記録を根拠に、日本語で${periodName}のAIレポートを作成してください。日次では先頭の記録を中心に過去記録との変化も述べ、週次・月次では今日の日付を基準に対象期間を判断してください。
複数記録がある場合は、継続行動、増えているカテゴリ、気分の変化、満足度の傾向、繰り返し現れる内容を日付と件数に基づいて比較してください。
プロフィールが設定されている場合は、目標との一致、価値観に沿った行動、過去からの成長、本人に向いている行動のうち、記録から根拠を示せる観点を必ず具体的に含めてください。
週次・月次の助言は、本人の目標や大切にしていることへ自然につながる内容にしてください。
プロフィールは解釈の補助として扱い、日記にない行動を事実として作らないでください。性格を決めつけず、プロフィールと記録が異なる場合は記録を優先してください。
データから確認できないことは断定せず、説教や診断を避けてください。
最初に「タイトル:」に続けて、記録一覧カードに適した15文字以内の短いタイトルを1行で付けてください。
各項目は2〜4文程度、TOP3は番号付きリスト、次への提案は実行しやすい内容にしてください。

## AIプロフィール
${formatAiProfile(input.aiProfile)}

## 保存済み記録
対象記録数: ${records.length}

${records.map((record, index) => `### 記録${index + 1}\n${serializeRecord(record)}`).join('\n\n') || '対象期間の記録はありません'}

## 出力形式
次の順番を必ず使い、Markdownで出力してください。コードフェンスは不要です。

タイトル: 短いタイトル
${headings}`;
}

export const buildDailyReportPrompt = buildReportPrompt;
