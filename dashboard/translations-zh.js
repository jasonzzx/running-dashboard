'use strict';
// Full sentences preserve meaning; {n} placeholders retain live values.
(() => {
  const entries = [
    ['RUNNING','跑步'], ['DATA','数据'], ['JASON / RUNNING DATA','JASON / 跑步数据'], ['Pace change','配速变化'],
    ['Custom dates','自定义日期'], ['Moving time','移动时间'], ['Longest activity','最长活动'], ['Average HR','平均心率'], ['Elapsed time','经过时间'],
    ['with an activity','有活动记录'], ['longest activity','最长活动'], ['No earlier distance to compare','没有更早的距离数据可供对比'],
    ['Long efforts','长距离活动'], ['Heart-rate coverage','心率数据覆盖率'], ['Road / outdoor volume','公路 / 户外训练量'], ['Treadmill volume','跑步机训练量'],
    ['Based on source summary distance','基于来源摘要中的距离'],
    ['A count of longer sessions, not a training-load or readiness assessment.','此处统计较长距离活动的次数，不代表训练负荷或训练准备度评估。'],
    ['Activities with an average heart-rate value in the canonical source summary.','主来源摘要中具有平均心率数据的活动。'],
    ['Generic original FIT sub-sport; track and trail are separate.','原始 FIT 文件中的通用子运动类型；跑道和越野单独分类。'],
    ['Treadmill identified from original FIT sub-sport, rather than activity names.','根据原始 FIT 文件中的子运动类型识别跑步机活动，而非根据活动名称判断。'],
    ['All settings cannot be analysed together here; choose a setting below.','此处无法将所有场景合并分析，请在下方选择一个场景。'],
    ['This overview setting has no Garmin mechanics cohort; choose a setting below.','当前概览场景没有对应的 Garmin 跑姿数据组，请在下方选择一个场景。'],
    ['Full-history snapshot through','完整历史快照截至'], ['. Dates stay fixed at the latest recorded run.','。日期固定为最近一次记录的跑步日期。'],
    ['Includes weeks or months with no recorded activity.','包含没有活动记录的周或月。'],
    ['No activities in this range.','此时间范围内没有活动。'], ['No comparable pace and heart-rate pairs.','没有可供对比的配速与心率数据对。'],
    ['No matching activities. Adjust the filters or search.','没有匹配的活动，请调整筛选条件或搜索内容。'],
    ['Inspect','查看'], ['Inspect ↗','查看 ↗'], ['Inspect recording ↗','查看原始记录 ↗'], ['Lap','分段'], ['Timer pace','计时配速'], ['Timer time','计时时间'], ['Power','功率'],
    ['No description recorded.','未记录活动描述。'], ['No notes recorded.','未记录备注。'], ['No recorded laps in this file.','此文件没有分段记录。'],
    ['Recording detail could not be loaded. Keep the details folder beside this page.','无法加载活动详情，请确认详情文件夹与此页面位于同一目录。'],
    ['This metric is not available in the recording.','此记录没有该指标的数据。'], ['33 km onward','33 公里之后'], ['33 km to finish','33 公里至终点'], ['33 km to finish:','33 公里至终点：'],
    ['Late-effort comparison needs a continuous distance series covering 5–30 km and at least 33–35 km.','后程对比需要连续的距离记录，覆盖 5–30 公里以及至少 33–35 公里的区间。'],
    ['Elapsed pace over the baseline distance.','基准距离区间的经过时间配速。'],
    ['Slower pace after 33 km. Context matters; this does not identify the cause.','33 公里后的配速变慢。需要结合背景解读，不能据此确定原因。'],
    ['Faster pace after 33 km. Context matters; this does not establish unused capacity.','33 公里后的配速变快。需要结合背景解读，不能据此认定仍有未发挥的能力。'],
    ['No distance samples available for comparison.','没有可供对比的距离采样。'], ['Choose two different efforts to compare.','请选择两次不同的活动进行对比。'], ['Loading efforts…','正在加载活动…'],
    ['Recorded pace','记录配速'], ['Recorded heart rate','记录心率'], ['● First effort','● 第一次活动'], ['● Second effort','● 第二次活动'],
    ['These may be training runs, trail efforts, or races. Similar distances do not imply comparable terrain, weather, effort, or fueling. Timing comes from original samples and includes pauses.','这些活动可能是训练跑、越野或比赛。距离相近并不意味着地形、天气、用力程度或补给条件相同。时间来自原始采样，包含暂停。'],
    ['Pace data is unavailable. Rebuild the dashboard to generate it.','配速数据暂不可用，请重新生成仪表盘数据。'],
    ['Treadmill runs are excluded. Choose Road / outdoor or another setting.','已排除跑步机记录，请选择公路 / 户外或其他场景。'], ['No usable running intervals in this selection.','当前筛选中没有可用的跑步区间。'],
    ['Each interval between consecutive original samples is assigned to a 30-second pace range using its distance increase and elapsed time. Time and distance are summed separately; these are not activity-average paces or counts of samples. Ranges include their lower bound and exclude their upper bound. The first and last ranges include all faster and slower valid paces.','根据连续原始采样之间的距离增量和经过时间，将每个区间归入以 30 秒为间隔的配速范围。时间和距离分别汇总，并非活动平均配速或采样数量。每个范围包含下限、不包含上限；首尾范围分别包含所有更快或更慢的有效配速。'],
    ['We exclude recorded timer stops, stationary or backwards-distance intervals, missing values, gaps longer than 30 seconds, and speeds above 10 m/s. Where timer events are absent, the distance and gap checks still apply. Short unmarked pauses can remain. Excluded intervals are reported separately and are not assigned a pace. Totals may differ from Strava summaries. Pace is an estimate from recorded distance; GPS errors and hills still affect it.','计算排除已记录的计时暂停、静止或距离倒退的区间、缺失值、超过 30 秒的采样间隔，以及超过 10 米/秒的速度。没有计时事件时，仍执行距离和采样间隔检查。短暂且未标记的暂停可能保留。被排除的区间单独列出，不分配配速。因此总计可能与 Strava 摘要不同。配速根据记录距离估算，仍受 GPS 误差和坡度影响。'],
    ['01 / The long view','01 / 长期视角'], ['02 / Recent training structure','02 / 近期训练结构'], ['03 / Pace and heart-rate context','03 / 配速与心率背景'], ['04 / Long efforts and late-run durability','04 / 长距离训练与后程耐力'], ['06 / How to judge whether it is working','06 / 如何判断训练是否有效'],
    ['COACHING INTERPRETATION · CONDITIONAL','训练解读 · 条件性建议'], ['Limited long-effort evidence','长距离活动证据有限'], ['Coverage varies','数据覆盖情况不一'],
    ['Late-run splits are available, but route, weather, stops and intent differ.','具备后程分段数据，但路线、天气、暂停和训练目的各不相同。'],
    ['Use repeated runs at similar pace and setting before interpreting a change.','先积累相近配速与相同场景下的多次跑步记录，再解读变化。'],
    ['Annual distance describes exposure and consistency, rather than fitness. Moving pace uses runs with valid distance and moving time; a dash means no valid timed runs. The first and latest years are partial; a lower annual total can reflect a change of surface or missing source data.','年度距离反映训练量和持续性，并不直接代表体能。移动配速仅使用具有有效距离和移动时间的跑步记录；破折号表示没有有效计时记录。首年和最近一年均可能不完整；年度总量较低也可能源于场景变化或源数据缺失。'],
    ['Training direction: preserve repeatable training first. Do not chase a previous annual peak simply because it is your highest number. Compare the same months and setting when judging year-to-year progression.','训练方向：优先保持可持续、可重复的训练。不要仅因为某年的里程最高，就追求重现该峰值。评估逐年进展时，应对比相同月份和相同场景。'],
    ['Training direction: retain the treadmill as a convenient aerobic tool, but judge road-race readiness using road sessions. When rebuilding outdoor volume, replace some indoor distance rather than automatically adding outdoor work on top of it.','训练方向：保留跑步机作为方便的有氧训练工具，但应根据公路训练评估公路比赛的准备情况。恢复户外跑量时，可替换部分室内里程，避免直接在原有室内训练量上叠加。'],
    ['A broad comparison cohort uses only this setting, 8–16 km runs, and activity-average moving pace of 4:30–5:00/km. The two adjacent 42-day windows avoid mixing treadmill and road. This is not a laboratory test or within-run cardiac-drift measurement.','对比组仅纳入当前场景中距离为 8–16 公里、活动平均移动配速为 4:30–5:00/公里的跑步。两个相邻的 42 天窗口避免混合跑步机与公路记录。这不是实验室测试，也不是单次跑步中的心率漂移测量。'],
    ['Insufficient paired coverage to interpret a change.','配对数据不足，无法解读变化。'],
    ['The higher recent treadmill HR deserves context before prescribing more intensity. Check fan/cooling, room temperature, incline, calibration, sensor consistency and perceived effort. It does not by itself establish loss of fitness or fatigue.','近期跑步机心率较高，应先了解背景再决定是否增加强度。请检查风扇与散热、室温、坡度、校准、传感器一致性及主观用力感。仅凭该变化不能判定体能下降或疲劳。'],
    ['Training direction: repeat a comfortable 30–45 minute session under similar conditions, using the same sensor and recording effort, before drawing conclusions about efficiency.','训练方向：在相近条件下，使用同一传感器，重复进行舒适的 30–45 分钟训练，并记录主观用力感，再对效率作出判断。'],
    ['Keep easy running conversational. Do not import treadmill HR targets into road workouts. Garmin threshold estimates are retained, but maximum HR and lactate threshold have not been independently validated, so this report does not invent training zones or label activity-average pace as time in an intensity zone.','轻松跑应保持能够交谈的强度。不要直接将跑步机心率目标用于公路训练。虽然保留了 Garmin 的阈值估计，但最大心率和乳酸阈值尚未独立验证，因此本报告不推定训练区间，也不将活动平均配速视为某强度区间内的时间。'],
    ['Latest road marathon:','最近一次公路马拉松：'],
    ['Training direction: after recovery and a stable base, rehearse controlled marathon-effort segments late in selected road long runs. Begin with a manageable block such as 2 × 15 minutes with easy running between, rather than making every long run a race simulation. Practise fueling, wind exposure and effort-based pacing together. A slowing split cannot distinguish fueling, muscular fatigue, wind, pacing decisions or motivation.','训练方向：恢复充分并建立稳定基础后，可在部分公路长跑的后程加入可控的马拉松用力程度训练段。先从可承受的结构开始，例如 2 × 15 分钟，中间以轻松跑恢复，不必将每次长跑都变成比赛模拟。同时练习补给、迎风应对与按用力程度配速。分段变慢本身无法区分补给、肌肉疲劳、风、配速决策或动力等原因。'],
    ['28-day window','28 天窗口'], ['Runs / running days','次数 / 跑步天数'], ['km/week','公里/周'], ['30 km+','30 公里以上'], ['25 km+','25 公里以上'], ['33 km → finish','33 公里 → 终点'],
    ['Sleep','睡眠'], ['Resting heart rate','静息心率'], ['Weekly-average HRV','每周平均 HRV'], ['Activity metric','活动指标'], ['Latest 84 days','最近 84 天'], ['Prior 84 days','此前 84 天'],
    ['HRV is Garmin’s weekly average recorded on each source-local date, so adjacent dates are not independent nightly HRV tests. Readiness and load are device estimates; the exported daily value may have been recorded after training. Mechanics also change with pace, terrain, sensor and workout mix. These comparisons describe the archive and do not identify fatigue, fitness gains or injury risk. See Dynamics & recovery for the full trends.','HRV 是 Garmin 按来源当地日期记录的每周平均值，因此相邻日期并非独立的夜间 HRV 测试。训练准备度和负荷是设备估计值，导出的每日数值可能在训练后记录。跑姿也随配速、地形、传感器及训练组合而变化。这些对比用于描述历史记录，不能据此判定疲劳、体能提升或受伤风险。完整趋势请见“跑姿数据与恢复”。'],
    ['Take several days away from running, or longer if soreness and fatigue persist. Walking or comfortable low-impact activity is optional. Return with short, easy running only when normal daily movement feels comfortable; do not use your recent weekly average as a recovery-week target. Sleep, carbohydrate, protein and hydration support recovery. [1]','暂停跑步数天；若酸痛与疲劳持续，应延长恢复时间。可选择散步或舒适的低冲击活动。待日常活动感觉舒适后，再从短距离轻松跑开始；不要将近期周均跑量作为恢复周目标。睡眠、碳水化合物、蛋白质与补水有助于恢复。[1]'],
    ['Re-establish comfortable frequency before restoring workout volume. Use your own sustainable, non-race weeks as the reference. Keep most running conversational, with genuinely easy days between demanding sessions. Add either duration or intensity at a time; hold the load when recovery deteriorates. The dataset cannot tell us your current pain, sleep or readiness.','先恢复舒适的跑步频率，再恢复训练量。以你自身可持续的非比赛周为参考。多数跑步应保持能够交谈的强度，高负荷训练之间安排真正轻松的日子。每次只增加时长或强度中的一项；恢复变差时维持负荷。数据集无法判断你当前的疼痛、睡眠或准备情况。'],
    ['Once easy running is stable, start with one controlled quality session per week and keep the long run easy. An example is 3 × 8 minutes at a comfortably hard, repeatable effort, with 2–3 minutes easy jogging. This is a proposed starting structure, not a pace prescription from validated threshold testing. Short relaxed strides can be added on a separate easy day if well recovered.','轻松跑稳定后，可从每周一次可控的质量训练开始，并保持长跑轻松。例如，以舒适但有挑战、能够重复的用力程度完成 3 × 8 分钟，组间轻松慢跑 2–3 分钟。这只是建议的起始结构，并非经阈值测试验证的配速处方。恢复良好时，可在另一个轻松日加入短距离、放松的加速跑。'],
    ['Alternate an easy long run with a long run containing a modest marathon-effort section. If the long run contains quality, count it as a demanding session and reduce other intensity. Build the late-effort segment gradually; do not increase long-run length and its fast portion simultaneously. Set road targets from road evidence and a current tune-up race, not treadmill pace.','交替安排轻松长跑，以及含适量马拉松用力程度训练段的长跑。若长跑包含质量训练，应将其计为高负荷课，并减少其他强度。逐步增加后程训练段，不要同时增加长跑总长度和快速段长度。公路目标应基于公路训练证据与近期热身赛，而非跑步机配速。'],
    ['Introduce or maintain two short strength sessions when recovered: controlled calf raises, split squats, hip-hinge work and trunk stability, adapted to experience. Log session effort, soreness, sleep and whether the workout felt repeatable. Keep one flexible recovery day. These are coaching suggestions, not findings that strength or rest is currently missing.','恢复充分后，可开始或保持每周两次简短力量训练：根据经验选择可控的提踵、分腿蹲、髋铰链动作及躯干稳定训练。记录训练用力感、酸痛、睡眠，以及是否感觉能够重复该训练。保留一个可灵活安排的恢复日。这些是训练建议，并不代表数据已证明你目前缺少力量训练或休息。'],
    ['Record carbohydrate per hour, fluid intake and gut comfort during demanding long runs. AIS guidance uses 30–60 g carbohydrate/hour for 1–2.5 hours of endurance exercise; longer events can require an individually practised strategy. Do not introduce an untested race-day intake. This archive does not measure what you actually consumed. [2]','在高负荷长跑中记录每小时碳水化合物摄入量、饮水量与胃肠舒适度。AIS 指南建议，持续 1–2.5 小时的耐力运动每小时摄入 30–60 克碳水化合物；更长的比赛可能需要经过个人实践的补给策略。不要在比赛当天首次尝试未经测试的摄入方案。本档案没有测量你实际摄入的补给。[2]'],
    ['Your previously described watch-confidence pattern is context from our conversation, not something inferred from FIT data. In selected controlled runs, practise checking lap-average pace at planned checkpoints rather than reacting to instantaneous pace. Pair each check with breathing, posture and effort cues. Review the segment afterwards; do not force pace into a headwind just to satisfy the display.','你此前描述的手表读数与信心之间的关系来自我们的对话背景，并非 FIT 数据推断。在部分可控训练中，练习在预定检查点查看分段平均配速，避免对瞬时配速立即作出反应。每次检查同时关注呼吸、姿势与用力感，训练后再回顾该区间；不要只为满足屏幕数字而在逆风中强行提速。'],
    ['Is the base repeatable?','基础训练能否持续重复？'], ['Several stable weeks; easy-run effort; recovery between sessions','连续数周的稳定训练、轻松跑用力感、训练之间的恢复'], ['Progress only when easy days remain easy; no automatic 10% rule.','仅在轻松日仍然轻松时增加训练；不机械套用每周增加 10% 的规则。'],
    ['Is road durability improving?','公路后程耐力是否改善？'], ['Comparable late road segments, fueling and conditions logged','可比的公路后程区间，以及补给和环境记录'], ['Look for less slowing at similar effort across repeated sessions, not one heroic long run.','观察多次训练在相近用力程度下是否减少掉速，而非依赖某一次超常长跑。'],
    ['Is treadmill effort changing?','跑步机上的用力程度是否变化？'], ['Same machine, incline, cooling, sensor and similar duration','同一跑步机、相同坡度、散热和传感器，以及相近时长'], ['Investigate context before changing road training zones.','先调查背景，再考虑调整公路训练区间。'],
    ['Is the next marathon goal supported?','下次马拉松目标是否有依据？'], ['Current road tune-up result and controlled long-run work','近期公路热身赛成绩与可控长跑训练'], ['Treat 3:55/km as a goal to test; the archive cannot guarantee it for 42.195 km.','将 3:55/公里视为待验证的目标；历史记录不能保证你能以此配速完成 42.195 公里。'],
    ['Is recovery limiting progress?','恢复是否限制了进展？'], ['Garmin sleep, HRV/resting-HR trends, plus subjective fatigue','Garmin 睡眠、HRV / 静息心率趋势，以及主观疲劳'], ['Combine trends with symptoms; no single wearable score determines readiness.','结合趋势和身体感受判断；任何单一穿戴设备评分都不能决定训练准备情况。'],
    ['A practical recovered-week structure: easy run → controlled quality → easy/recovery → easy run plus strength → easy or rest → long run → recovery. Adjust the number of running days to what you can sustain; this is not a requirement to run seven days.','恢复充分时，可参考以下一周结构：轻松跑 → 可控质量训练 → 轻松 / 恢复 → 轻松跑加力量 → 轻松或休息 → 长跑 → 恢复。根据自身可持续的安排调整跑步天数，并非要求每周跑七天。'],
    ['Combined Strava and Garmin running history; UTC activity dates. Aggregate moving pace uses only activities with positive distance and moving time; activity and distance totals still include runs without timing. Garmin wellness uses source-local calendar dates through the latest activity and daily medians for adjacent 28-day windows. Garmin mechanics medians use 8–16 km runs at activity-average 4:30–5:00/km within each setting and adjacent 84-day windows. Late-effort pace uses elapsed-time crossings in original full-resolution recordings.','合并 Strava 与 Garmin 跑步历史，活动日期使用 UTC。汇总移动配速仅使用距离与移动时间均大于零的活动；活动次数和距离总计仍包含没有计时的跑步。Garmin 健康数据使用截至最新活动的来源当地日期，并对相邻 28 天窗口中的每日记录取中位数。跑姿中位数使用各场景相邻 84 天窗口内、距离 8–16 公里且活动平均配速为 4:30–5:00/公里的跑步。后程配速根据原始完整采样记录中穿越距离界点的经过时间计算。'],
    ['Road / outdoor maps to original FIT generic, which is a broad designation rather than verified road surface. Track, trail, treadmill and unclassified records stay separate. Dates are UTC. The 84-day and 28-day windows end at the newest run, not today. Running days count distinct dates, not sessions; zero-volume periods remain part of each window denominator.','公路 / 户外对应原始 FIT 中的 generic 类型，这是宽泛分类，并非经过验证的公路路面。跑道、越野、跑步机和未分类记录分别保留。日期使用 UTC。84 天和 28 天窗口截至最近一次跑步，而非今天。跑步天数统计不同日期，不是训练次数；没有训练量的时间仍计入窗口长度。'],
    ['This is a reproducible snapshot generated locally from the combined import, not a live AI coach. All activity summaries are included in the history; full-resolution recordings support late-effort calculations. Individual chart display is downsampled. Workout-average pace hides intervals and pauses, so intensity distribution and threshold are deliberately not estimated from it.','这是根据合并导入数据在本地生成、可复现的快照，并非实时 AI 教练。历史包含所有活动摘要；后程计算使用完整分辨率记录。单次活动图表为便于显示进行了降采样。活动平均配速会掩盖间歇和暂停，因此不据此估计强度分布或阈值。'],
    ['Garmin sleep, HRV weekly averages, resting HR, readiness and training load are now available in Dynamics & recovery. Still unknown: illness, injuries, subjective fatigue, reliable weather, treadmill incline/calibration, actual fueling, and official race timing. Device metrics add context but do not establish causes.','“跑姿数据与恢复”现已包含 Garmin 睡眠、HRV 周均值、静息心率、训练准备度与训练负荷。仍未知的因素包括疾病、伤病、主观疲劳、可靠天气、跑步机坡度与校准、实际补给及官方比赛计时。设备指标可补充背景，但不能确定因果。'],
    ['None','无'], ['UCLA Health — marathon recovery','UCLA Health — 马拉松赛后恢复'], ['Australian Institute of Sport — endurance carbohydrate guidance','澳大利亚体育学院 — 耐力运动碳水化合物指南'],
    ['. Guidance checked October 20, 2026 UTC. Training structure above is a coaching proposal, not an individually tested prescription.','。指南核查日期为 2026 年 10 月 20 日（UTC）。上述训练结构是建议方案，并非经过个人测试的训练处方。'],
    ['Ground contact','触地时间'], ['Vertical ratio','垂直比'], ['Vertical oscillation','垂直振幅'], ['Stride length','步幅'], ['Step length','步幅'], ['Cadence','步频'], ['Stride','步幅'], ['Contact','触地时间'], ['Stride length · m','步幅 · 米'], ['Pace /km','配速 /公里'], ['Date','日期'], ['Run','跑步'], ['Cadence Δ','步频变化'], ['Stride Δ','步幅变化'], ['Contact Δ','触地时间变化'], ['Vertical ratio Δ','垂直比变化'],
    ['Under 3:30','快于 3:30'], ['6:00 or slower','6:00 或更慢'], ['Aerobic effect','有氧效果'], ['Anaerobic effect','无氧效果'], ['Activity load','活动负荷'],
    ['No measurements for this selection.','当前筛选没有测量数据。'], ['Not enough runs to form pace groups.','跑步记录不足，无法按配速分组。'], ['No qualifying long runs with original dynamics samples.','没有符合条件且包含原始跑姿采样的长跑。'], ['No Garmin summary matched to this activity.','没有匹配此活动的 Garmin 摘要。'],
    ['Each point is a monthly median of activity averages; runs have equal weight. Pace, incline, sensor and workout mix can change the trend.','每个点是当月活动平均值的中位数，每次跑步权重相同。配速、坡度、传感器和训练组合都可能改变趋势。'],
    ['Running economy:','跑步经济性：'],
    ['no dedicated economy field was found in this export. The available mechanics and power describe how the run was recorded, but they are not a direct oxygen-cost measurement. Do not force a lower contact time, cadence, or vertical ratio simply to improve a number.','此次导出未发现专门的跑步经济性字段。现有跑姿与功率指标描述记录中的跑步表现，并非直接的耗氧量测量。不要仅为改善数字而强行降低触地时间、步频或垂直比。'],
    ['Your 3:45–4:15 versus 4:30–5:30 pattern:','你的 3:45–4:15 与 4:30–5:30 配速区间对比：'],
    ['Faster pace normally changes cadence, stride length and contact time together. This view controls one major confounder by grouping similar activity-average pace, but it does not control hills, intervals, fatigue, shoes or weather.','配速加快通常伴随步频、步幅和触地时间共同变化。按相近活动平均配速分组可以控制一个主要混杂因素，但未控制坡度、间歇、疲劳、鞋或天气。'],
    ['Faster pace normally changes cadence, stride length and contact time together. This view controls one major confounder by grouping similar activity-average pace, but it does not control hills, intervals, fatigue, shoes or weather. Treadmill pace and distance depend on watch calibration, so compare treadmill bands cautiously.','配速加快通常伴随步频、步幅和触地时间共同变化。按相近活动平均配速分组可以控制一个主要混杂因素，但未控制坡度、间歇、疲劳、鞋或天气。跑步机配速与距离依赖手表校准，因此对比跑步机配速组时需谨慎。'],
    ['Each cell is a median of activity averages and may reflect the year’s workout mix. Compare the pace column first: a mechanics change alongside a pace change is not automatically a form improvement or decline.','每个单元格是活动平均值的中位数，可能反映当年的训练组合。请先对比配速列：跑姿指标随配速一起变化，并不自动意味着跑姿改善或退步。'],
    ['Each run contributes one change value, so long recordings do not dominate. A shorter stride or longer contact time late in a run describes the recorded pattern; it does not by itself prove fatigue. Pace, hills, wind, stops and workout design can create the same pattern. The first quarter is excluded to reduce warm-up effects, and the final 2% is excluded to reduce finish-line stopping artefacts.','每次跑步贡献一个变化值，因此长记录不会占据更大权重。后程步幅缩短或触地时间延长只是记录中的现象，不能单独证明疲劳。配速、坡度、风、暂停和训练设计也可能产生相同现象。计算排除前四分之一以减少热身影响，并排除最后 2% 以减少终点停步造成的干扰。'],
    ['Toronto 2026: mechanics after 33 km','多伦多 2026：33 公里后的跑姿'], ['Observed pattern:','观察到的现象：'],
    ['Sample-weighted means from the original marathon recording. These show co-occurring changes, not why pace changed.','根据原始马拉松记录按采样加权计算平均值。它们反映同时发生的变化，并不解释配速变化的原因。'],
    ['Training direction: compare mechanics at similar speed and terrain before changing technique. If a late pace drop coincides with shorter strides, examine durability, fueling and conditions; cadence alone is not a diagnosis.','训练方向：调整技术之前，先在相近速度和地形下对比跑姿。如果后程掉速同时伴随步幅缩短，应检查耐力、补给和环境条件；单凭步频不能作出判断。'],
    ["Garmin calendar dates are source-local. Missing measurements are omitted, never replaced by zero. HRV shown here is Garmin's weekly average, not a nightly measurement. These are device estimates, not a diagnosis or training clearance.",'Garmin 日期使用来源当地日期。缺失测量会被略过，绝不以零替代。此处 HRV 是 Garmin 的每周平均值，并非每晚的测量值。这些是设备估计，不构成诊断或可以训练的许可。'],
    ['Data through','数据截至'], ['activities after source reconciliation','来源核对后的活动'], ['original recorded samples','原始记录采样'], ['recorded laps','记录分段'], ['Garmin account archive imported.','已导入 Garmin 账户档案。'],
    ['Running dynamics, sleep, resting HR, training readiness and HRV history are now included. One possible overlapping activity is held for review rather than counted twice. See the Dynamics & recovery section.','现已包含跑姿、睡眠、静息心率、训练准备度及 HRV 历史。一项可能重复的活动已暂存待核查，未重复计数。详见“跑姿数据与恢复”。'],
    ['Matched activities retain Strava summary distance and moving time; Garmin-only history uses Garmin summaries. Detailed charts and laps come from original files. Dates are UTC, not inferred travel-local dates. No GPS coordinates or private account-profile data are included in this dashboard. Activity descriptions and private activity notes are included in individual details. Notes are context, not verified conclusions.','匹配的活动保留 Strava 摘要距离和移动时间；仅来自 Garmin 的历史使用 Garmin 摘要。详细图表和分段来自原始文件。日期使用 UTC，不推断旅行时的当地日期。此仪表盘不包含 GPS 坐标或私人账户资料。单次详情包含活动描述和私人活动备注；备注用于提供背景，并非经过验证的结论。'],
    ['Data has not been generated yet. Run scripts/build_dashboard.py after import.','尚未生成数据。导入后请运行 scripts/build_dashboard.py。'],
    ['Activity ID','活动 ID'], ['Date UTC','日期（UTC）'], ['Name','名称'], ['Sport','运动类型'], ['Distance km','距离（公里）'], ['Moving seconds','移动时间（秒）'], ['Elapsed seconds','经过时间（秒）'],
    // Dynamic sentences. Placeholders match complete values, never HTML.
    ['Full history · {0}','完整历史 · {0}'],
    ['Chart shows 15-second sample averages for readability; all {0} original samples remain in the database.','图表显示 15 秒采样均值以便阅读；数据库保留全部 {0} 个原始采样。'],
    ['LATEST 28 DAYS · {0} TO {1}','最近 28 天 · {0} 至 {1}'], ['{0}% vs prior 28 days','较此前 28 天 {0}%'],
    ['Distance-weighted across {0} valid time/distance pairs · {1} excluded','按距离加权计算，使用 {0} 组有效时间 / 距离数据 · 排除 {1} 组'],
    ['{0} at 25 km+','{0} 次活动达到 25 公里以上'],
    ['{0} activities · {1} to {2} · {3} · {4} · UTC. Applies to Overview, Explore and Pace. Other sections show their own scope.','{0} 项活动 · {1} 至 {2} · {3} · {4} · UTC。适用于概览、浏览记录及配速分布，其他部分使用各自标注的范围。'],
    ['{0} · {1} activities','{0} · {1} 项活动'], ['Training volume by {0}','按{0}统计训练量'], ['Explore {0}: {1} km across {2} activities','查看 {0}：{2} 项活动，共 {1} 公里'],
    ['{0} km\n{1} activities','{0} 公里\n{1} 项活动'], ['Activity pace versus heart rate; {0} points. Paces slower than 20 min/km omitted.','活动配速与心率：{0} 个数据点。省略慢于 20 分/公里的配速。'],
    ['{0} · {1} summary','{0} · {1} 摘要'],
    ['Source {0} · activity {1}. Recording: {2}. {3} original samples. {4}Original files remain unchanged.','来源 {0} · 活动 {1}。记录文件：{2}。{3} 个原始采样。{4}原始文件保持不变。'],
    ['Multiple FIT sessions: charts cover the complete file.','多个 FIT 会话：图表覆盖完整文件。'],
    ['Chart shows 15-second sample averages for readability; all {0} original samples remain in the database. {1}','图表显示 15 秒采样均值以便阅读；数据库保留全部 {0} 个原始采样。{1}'],
    ['Pace is computed from averaged recorded speed. Values slower than 20 min/km are omitted from this chart; elapsed splits still include stops. Recording quality flags are available in the data coverage report.','配速根据记录速度的平均值计算。图表省略慢于 20 分/公里的值；经过时间分段仍包含暂停。数据覆盖报告中可查看记录质量标记。'],
    ['Pace is computed from averaged recorded speed. Values slower than 20 min/km are omitted from this chart; elapsed splits still include stops.','配速根据记录速度的平均值计算。图表省略慢于 20 分/公里的值；经过时间分段仍包含暂停。'],
    ['Recording quality flags are available in the data coverage report.','数据覆盖报告中可查看记录质量标记。'],
    ['{0} over {1}','随{1}变化的{0}'], ['{0} km · elapsed pace, including pauses.','{0} 公里 · 经过时间配速，包含暂停。'],
    ['No {0} samples available in the shared distance.','共同距离区间内没有可用的{0}采样。'], ['Aligned {0} comparison through {1} km','对齐至 {1} 公里的{0}对比'],
    ['{0} km · {1} elapsed · {2} bpm','{0} 公里 · 经过时间 {1} · {2} 次/分钟'],
    ['Both lines share a distance axis from 0 to {0} km. Pace comes from recorded speed; missing and slower than 20 min/km points are omitted. Shared chart scales show differences, not cause.','两条曲线共用 0 至 {0} 公里的距离轴。配速来自记录速度；缺失及慢于 20 分/公里的点被省略。统一刻度用于显示差异，并不解释原因。'],
    ['{0} of {1} eligible runs with usable intervals · {2} h · {3} km included · {4} h of recorded intervals excluded. Treadmill records contribute nothing to these totals.','{1} 次符合条件的跑步中，{0} 次有可用区间 · 计入 {2} 小时、{3} 公里 · 排除 {4} 小时的记录区间。以上总计不包含跑步机记录。'],
    ['{0} min/km: {1} ({2}%)','{0} 分/公里：{1}（{2}%）'],
    ['SNAPSHOT · THROUGH {0}','快照 · 截至 {0}'], ['{0}: {1} km across {2} runs','{0}：{2} 次跑步，共 {1} 公里'], ['{0} km / 28 days','{0} 公里 / 28 天'], ['{0} long-effort recordings','{0} 次长距离活动记录'],
    ['{0} in {1}. Road and treadmill exposure are shown together below.','{1}：{0}。下方并列展示公路与跑步机训练量。'],
    ['No prior distance to compare','没有此前距离可供对比'], ['{0}% versus the preceding 28 days','较此前 28 天变化 {0}%'],
    ['Weekly-average HRV median across the latest and prior 28 days ({0} and {1} measured dates). Device estimates and workout timing limit interpretation.','最近与此前 28 天的每周平均 HRV 中位数（分别有 {0} 和 {1} 天测量记录）。设备估计误差与训练时点限制了解读。'],
    ['{0} vs {1} ms','{0} 与 {1} 毫秒'],
    ['Full archive: {0} km across {1} runs. Open the sections below for annual history, comparable efforts, Garmin measurements and training direction.','完整档案：{1} 次跑步，共 {0} 公里。展开下方内容可查看年度历史、可比活动、Garmin 测量及训练方向。'],
    ['Latest versus preceding 28 days: {0}. This is a description, not an injury-risk score. The latest window includes the October 18 marathon and its taper, so it is not a normal base-building block.','最近 28 天与此前 28 天相比：{0}。这是描述性统计，并非受伤风险评分。最近窗口包含 10 月 18 日马拉松及赛前减量，因此不是正常的基础训练阶段。'],
    ['no comparable prior volume','没有可比的此前训练量'], ['{0}% distance in this setting','此场景的距离变化为 {0}%'],
    ['Road exposure averaged {0} km/week in the latest block, versus {1} before it. Treadmill exposure averaged {2} versus {3} km/week. A change in one setting can be a redistribution rather than a change in total load.','最近阶段的公路跑量平均为每周 {0} 公里，此前为 {1} 公里。跑步机跑量分别为每周 {2} 和 {3} 公里。单一场景中的变化可能只是训练量重新分配，并非总负荷变化。'],
    ['The newer cohort has a {0} bpm median difference. {1}','较新组的心率中位数变化为 {0} 次/分钟。{1}'],
    ['Both cohorts contain at least five runs, but pace, temperature, sensor, incline and workout structure are not controlled.','两组均包含至少五次跑步，但未控制配速、温度、传感器、坡度和训练结构。'],
    ['At least one cohort has fewer than five runs, so this is too sparse to interpret as a trend.','至少一组少于五次跑步，数据过少，不能解读为趋势。'],
    ['{0} efforts in this setting have valid distance coverage for a 5–30 km versus 33 km-to-finish comparison. Positive change means slower late pace. Different routes, stops, weather and intended progression make these efforts non-equivalent.','此场景中有 {0} 次活动具备有效距离覆盖，可对比 5–30 公里与 33 公里至终点的配速。正值表示后程变慢。路线、暂停、天气和计划中的渐进加速不同，因此这些活动并不完全等同。'],
    ['the recording shows {0}/km over 5–30 km and {1}/km after 33 km, a {2}% slowing. Recorded elapsed time was {3} {4}s over {5} km; this is a GPS activity, not an official certified-course result. This supports late-race pace retention as a useful training and execution focus, without identifying the cause.','记录显示，5–30 公里配速为 {0}/公里，33 公里后为 {1}/公里，变慢 {2}%。记录距离 {5} 公里，经过时间 {3} {4}秒；这是 GPS 活动记录，并非官方认证赛道成绩。这提示可将后程配速保持作为训练与比赛执行重点，但不能确定掉速原因。'],
    ['Adjacent 28-day wellness windows: {0} → {1} versus {2} → {3}. Each value is a median of measured dates; missing dates are excluded.','相邻 28 天健康数据窗口：{0} → {1}，对比 {2} → {3}。每个值为有测量记录日期的中位数，缺失日期不参与计算。'],
    ['Running mechanics use only {0} runs of 8–16 km at activity-average 4:30–5:00/km. Latest and prior 84-day windows contain {1} and {2} qualifying runs.','跑姿分析仅使用 {0} 中距离 8–16 公里、活动平均配速为 4:30–5:00/公里的跑步。最近与此前 84 天窗口分别包含 {1} 和 {2} 次符合条件的跑步。'],
    ['{0} ({1}/28 days)','{0}（{1}/28 天）'], ['{0} ({1} runs)','{0}（{1} 次跑步）'],
    ['{0} by activity-average pace','按活动平均配速统计{0}'], ['{0} · median {1} · {2} runs','{0} · 中位数 {1} · {2} 次跑步'], ['{0} · {1} observations','{0} · {1} 条观测'],
    ['{0} runs with this metric.','{0} 次跑步具有此指标。'], ['{0} measured runs across {1} pace bands for {2}.','{0} 次有测量记录的跑步，覆盖 {1} 个配速区间；指标：{2}。'],
    ['median cadence changes by {0} steps/min, stride length by {1}%, and ground contact by {2}%. In these activity groups, the larger pace separation appears in stride length while cadence stays comparatively stable. This is a descriptive pattern, not a cue to overstride.{3}','步频中位数变化 {0} 步/分钟，步幅变化 {1}%，触地时间变化 {2}%。这些活动组之间的配速差异更多体现在步幅，步频相对稳定。这是描述性现象，并非鼓励过度跨步。{3}'],
    ['Ground-contact coverage is incomplete in these groups.','这些组的触地时间数据覆盖不完整。'],
    ['{0} change','{0}变化'], ['Median late-minus-reference change · {0} runs','后程减去参考区间的变化中位数 · {0} 次跑步'], ['{0} {1} km+ runs qualify.','{0} 次 {1} 公里以上的跑步符合条件。'],
    ['. In the displayed period: {0} measured days. Latest seven-calendar-day median:','。当前显示范围内有 {0} 天测量记录。最近七个自然日的中位数：'],
    ['({0} measured days); preceding 28-day median:','（{0} 天有测量记录）；此前 28 天的中位数：'],
    ['({0} measured days). Readiness uses the latest exported measurement for each day, which may be after a workout rather than in the morning.','（{0} 天有测量记录）。训练准备度使用每天最新导出的测量值，可能记录于训练后，而非早晨。'],
    ['Garmin activity {0}','Garmin 活动 {0}'],
    ['cadence changed from {0} to {1} steps/min; stride length from {2} to {3} m; ground contact from {4} to {5} ms. Recorded power changed from {6} to {7} W. The slower pace therefore did not coincide with a large cadence drop or lower recorded power.','步频从 {0} 变为 {1} 步/分钟；步幅从 {2} 变为 {3} 米；触地时间从 {4} 变为 {5} 毫秒。记录功率从 {6} 变为 {7} 瓦。因此配速变慢并未同时伴随步频大幅下降或记录功率降低。'],
    ['Imported {0} through {1}. {2} recording import errors. {3} potential duplicate pairs flagged for review. {4} Strava activities differ from their original FIT session distance by more than 1% or 100 m. Garmin summary and original-session values are also retained separately when calibration or processing differs.','导入范围为 {0} 至 {1}。记录导入错误 {2} 项；标记待核查的疑似重复对 {3} 组。{4} 项 Strava 活动与原始 FIT 会话距离相差超过 1% 或 100 米。当校准或处理方式不同时，也分别保留 Garmin 摘要与原始会话数值。']
  ];
  const words = {
    running:'跑步', treadmill:'跑步机', cycling:'骑行', walking:'步行', hiking:'徒步', swimming:'游泳', training:'训练', fitness_equipment:'健身器械', generic:'通用', other:'其他', elliptical:'椭圆机',rowing:'划船', 'stair-stepper':'登阶机',stop_watch:'秒表记录',workout:'体能训练', strava:'Strava',garmin:'Garmin',
    week:'周', month:'月', year:'年', pace:'配速', hr:'心率', 'heart-rate':'心率', 'heart rate':'心率', power:'功率', cadence:'步频', altitude:'海拔', ground:'触地时间', oscillation:'垂直振幅', stride:'步幅', ratio:'垂直比', distance:'距离', time:'时间',
    'ground contact':'触地时间', 'vertical ratio':'垂直比', 'vertical oscillation':'垂直振幅', 'stride length':'步幅', 'step length':'步幅', 'Road / outdoor':'公路 / 户外', Treadmill:'跑步机', Track:'跑道', Trail:'越野', 'Other / unclassified':'其他 / 未分类', 'All settings':'全部场景', Running:'跑步', 'All activities':'所有活动',
    'Moving pace':'移动配速', Distance:'距离', 'Average HR':'平均心率', 'Elapsed time':'经过时间', 'Ground contact':'触地时间', Cadence:'步频', 'Vertical ratio':'垂直比', 'Stride length':'步幅',
    'Ground contact · ms':'触地时间 · 毫秒', 'Vertical ratio · %':'垂直比 · %', 'Vertical oscillation · mm':'垂直振幅 · 毫米', 'Stride length · m':'步幅 · 米', 'Cadence · steps/min':'步频 · 步/分钟', 'Power · W':'功率 · 瓦', 'VO₂ max estimate':'最大摄氧量估计', 'Aerobic training effect':'有氧训练效果', 'Sleep hours':'睡眠时长', 'Sleep score':'睡眠评分', 'Resting HR':'静息心率', 'Weekly HRV average · ms':'每周 HRV 平均值 · 毫秒', 'Training readiness':'训练准备度', 'Acute load':'急性负荷'
  };
  const exact = new Map(entries.filter(([key]) => !key.includes('{')));
  const patterns = entries.filter(([key]) => key.includes('{')).map(([key,value]) => {
    const slots = [];
    const pattern = key.split(/(\{\d+\})/).map(part => /^\{\d+\}$/.test(part) ? (slots.push(Number(part.slice(1,-1))), '([\\s\\S]*?)') : part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('');
    return {re:new RegExp('^'+pattern+'$'), value, slots};
  });
  function translate(source, depth=0) {
    const s=source.trim();
    if (exact.has(s)) return exact.get(s);
    if (words[s]) return words[s];
    const metricTip=s.match(/^(\d{4}-\d{2}-\d{2}) · ([\d,.—-]+) (.+?)(?: · (\d+) observations)?$/);
    if(metricTip) return metricTip[1]+' · '+metricTip[2]+' '+(translate(metricTip[3],depth+1)??metricTip[3])+(metricTip[4]?' · '+metricTip[4]+' 条观测':'');
    if (/^\d{4}-\d{2}-\d{2} · [a-z_-]+(?: · treadmill)? · [\w-]+$/.test(s)) return s.replace(/\b[a-z_-]+\b/g,w=>words[w]||w);
    if (/^[a-z_-]+(?: · treadmill)?$/.test(s)) return s.replace(/\b[a-z_-]+\b/g,w=>words[w]||w);
    if (s.includes('Private note\n')) return s.replace('Private note\n','私人备注\n');
    if(depth<4) for(const {re,value,slots} of patterns){
      const match=s.match(re); if(!match) continue;
      const values={}; slots.forEach((slot,i)=>values[slot]=translate(match[i+1],depth+1) ?? match[i+1]);
      return value.replace(/\{(\d+)\}/g,(_,i)=>values[i]);
    }
    if (/^\d+h \d+m(?: \d+s)?$/.test(s)) return s.replace('h','小时').replace('m','分钟').replace('s','秒');
    if (/^[\d.,+−—<>≥:–%\s-]+\s(?:km|h|m|ms|mm|bpm|spm|steps\/min|min|W)(?:\s*\(.*\))?$/.test(s)) return s.replace(/steps\/min|bpm|spm|km|ms|mm|\bh\b|\bm\b|\bmin\b|\bW\b/g,u=>({'steps/min':'步/分钟',bpm:'次/分钟',spm:'步/分钟',km:'公里',ms:'毫秒',mm:'毫米',h:'小时',m:'米',min:'分钟',W:'瓦'}[u]));
    if (/^[\d.,—:–\s]+\/?km$/.test(s)) return s.replace('km','公里');
    return null;
  }
  window.dashboardChineseText=translate;
})();
