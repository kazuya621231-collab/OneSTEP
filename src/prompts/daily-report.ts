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

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface ReportRequestInput extends JournalRecordInput {
  reportType?: ReportType;
  records?: JournalRecordInput[];
}

const REPORT_HEADINGS: Record<ReportType, string[]> = {
  daily: ['今日の総評', '客観的評価', '今日見えた傾向', '成長したこと', '明日の一歩'],
  weekly: ['今週の総評', '今週頑張ったことTOP3', '繰り返し見られた行動', '気分・満足度の変化', '来週へのアドバイス'],
  monthly: ['今月の総評', '成長したこと', '習慣化できたこと', '課題', '来月への提案'],
  custom: ['期間の総評', '期間中に頑張ったこと', '繰り返し見られた行動', '気分・満足度の変化', '次の期間への提案']
};

const REPORT_STYLE_GUIDANCE: Record<ReportType, string> = {
  daily: 'その日の具体的な出来事に寄り添い、短く温度感のある振り返りにしてください。明日すぐ試せる小さな一歩で締めてください。',
  weekly: '一日ごとの列挙ではなく、1週間を俯瞰した変化や反復を中心にしてください。日次レポートとは異なる要約表現を使ってください。',
  monthly: '長期的な変化、定着した行動、まだ整っていない点を俯瞰してください。週次レポートより広い視点で来月の方向性を示してください。',
  custom: '指定された開始日から終了日までを一つのまとまりとして捉え、期間の長さと記録件数に合った粒度で変化や反復をまとめてください。'
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
  const reportType: ReportType = input.reportType === 'weekly' || input.reportType === 'monthly' || input.reportType === 'custom'
    ? input.reportType
    : 'daily';
  const records = input.records?.length ? input.records : [input];
  const periodName = reportType === 'daily' ? '今日' : reportType === 'weekly' ? '今週' : reportType === 'monthly' ? '今月' : '指定期間';
  const detailHeadings = REPORT_HEADINGS[reportType].map(heading => `## ${heading}`).join('\n');

  return `あなたは、忙しい社会人の一日をやさしく客観視し、本人が気づいていない頑張りを見つけるジャーナリングAIです。

以下のAIプロフィールと保存済み記録を根拠に、日本語で${periodName}のAIレポートを作成してください。日次では先頭の記録を中心に過去記録との変化も述べ、週次・月次では今日の日付を基準に対象期間を判断してください。
複数記録がある場合は、継続行動、増えているカテゴリ、気分の変化、満足度の傾向、繰り返し現れる内容を日付と件数に基づいて比較してください。
プロフィールが設定されている場合は、目標との一致、価値観に沿った行動、過去からの成長、本人に向いている行動のうち、記録から根拠を示せる観点を必ず具体的に含めてください。
週次・月次の助言は、本人の目標や大切にしていることへ自然につながる内容にしてください。
プロフィールは解釈の補助として扱い、日記にない行動を事実として作らないでください。性格を決めつけず、プロフィールと記録が異なる場合は記録を優先してください。
データから確認できないことは断定せず、説教や診断を避けてください。
${REPORT_STYLE_GUIDANCE[reportType]}
良かった点だけに偏らず、維持したい点と無理なく改善できる点をバランスよく扱ってください。
評価には記録中の行動、日付、回数、満足度などの根拠を添え、入力されていない努力を推測で補わないでください。
同じ形容詞や結びを繰り返さず、自然で簡潔な日本語にしてください。「素晴らしい」「頑張りました」などの定型表現を連続して使わないでください。
見出しごとの役割を明確に分け、他の期間レポートと似た文章の使い回しを避けてください。
詳細版の各項目は2〜4文程度、TOP3は番号付きリスト、次への提案は実行しやすい内容にしてください。

## AIプロフィール
${formatAiProfile(input.aiProfile)}

## 保存済み記録
対象記録数: ${records.length}

${records.map((record, index) => `### 記録${index + 1}\n${serializeRecord(record)}`).join('\n\n') || '対象期間の記録はありません'}

## 出力形式
次のJSONだけを返してください。説明文やコードフェンスをJSONの外へ付けないでください。改行はJSON文字列内で\\nとして正しくエスケープしてください。

{
  "title": "記録一覧カードに適した15文字以内の短いタイトル",
  "summary": "## ${periodName}の総評\\n2〜3文。結論を先に書く。\\n\\n## 良かったこと\\n- 事実に基づく項目\\n- 事実に基づく項目\\n\\n## 次の一歩\\n1〜2文。\\n\\n## ${reportType === 'daily' ? '今日' : '期間'}の一言\\n20〜40文字程度。",
  "detail": "${detailHeadings.replaceAll('\n', '\\n')}\\n各見出しの本文を含む詳細分析。"
}

summaryはスマートフォンで1〜2スクロール以内に読める分量に制限し、短く、読みやすく、結論優先にしてください。良かったことは2〜3項目にしてください。
detailには従来どおり、記録を根拠にした十分な分析を含めてください。summaryとdetailの文章をそのまま重複させないでください。`;
}

export const buildDailyReportPrompt = buildReportPrompt;
