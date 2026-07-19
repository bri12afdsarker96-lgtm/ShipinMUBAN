// 可视化编辑 + 预览界面（阶段三）。
//
// 纯前端 React 应用：左侧表单编辑三件套/模板/音乐，右侧 @remotion/player 实时预览，
// 底部导出可直接喂给批量引擎的配置 JSON。复用渲染层的 propsFromRaw / durationForProps
// 与模板注册表，界面与渲染保持一致。

import React, {useEffect, useMemo, useState} from 'react';
import {Player} from '@remotion/player';
import {BookIntroFromConfig} from '../src/BookIntroFromConfig';
import {durationForProps, propsFromRaw} from '../src/config';
import type {RawConfigInput} from '../src/config';
import {templateIds, getTemplate} from '../src/templates';

const FPS = 30;

type Form = {
  template: string;
  audio: string;
  mainTitle: string;
  mainAuthor: string;
  mainZh: string;
  mainEn: string;
  flashBooksText: string;
  introMode: 'generated' | 'video';
  showSubtitles: boolean;
  subZh: string;
  subEn: string;
};

const INITIAL: Form = {
  template: 'classic',
  audio: 'sample-beat.wav',
  mainTitle: '月亮与六便士',
  mainAuthor: '毛姆',
  mainZh: '满地都是六便士，他却抬头看见了月亮',
  mainEn: 'Everyone has sixpence, he looked up at the moon',
  flashBooksText: ['了不起的盖茨比 | 菲茨杰拉德', '简爱 | 夏洛蒂', '瓦尔登湖 | 梭罗', '傲慢与偏见 | 奥斯汀', '白鲸 | 麦尔维尔'].join('\n'),
  introMode: 'generated',
  showSubtitles: true,
  subZh: '今天推荐五本世界名著',
  subEn: 'Five classics tonight',
};

// 默认节奏卡点（与 scripts/batch/lib/row-to-config.mjs 的 defaultCutFrames 一致）。
const defaultCutFrames = (count: number): number[] => {
  const start = 134;
  const beat = 5;
  const beats = Math.max(count, 3) + 1;
  return Array.from({length: beats}, (_, i) => start + i * beat);
};

const buildRaw = (form: Form): RawConfigInput => {
  const flashBooks = form.flashBooksText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [title, author] = line.split('|').map((s) => s.trim());
      return {title: title || '未命名', author: author || undefined, isbn: null, coverPath: null};
    });

  const tracks = form.subZh || form.subEn
    ? [{id: 's1', startFrame: 8, endFrame: 60, zh: form.subZh || undefined, en: form.subEn || undefined, position: 'lower'}]
    : [];

  return {
    template: form.template,
    audio: form.audio || undefined,
    books: {
      flashCutFrames: defaultCutFrames(flashBooks.length),
      flashBooks,
      mainBook: {
        title: form.mainTitle,
        author: form.mainAuthor || undefined,
        isbn: null,
        coverPath: null,
        backgroundPath: null,
        zhLine: form.mainZh || undefined,
        enLine: form.mainEn || undefined,
      },
    },
    subtitles: {tracks},
    intro: {mode: form.introMode, videoPath: null, trimStart: 0, trimEnd: null, volume: 1, muted: false, showSubtitles: form.showSubtitles},
  };
};

const labelStyle: React.CSSProperties = {display: 'block', fontSize: 12, color: '#5b6472', marginBottom: 4, marginTop: 14, fontWeight: 600};
const inputStyle: React.CSSProperties = {width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d3d9e0', borderRadius: 8, fontSize: 14, background: '#fff'};

const Field: React.FC<{label: string; children: React.ReactNode}> = ({label, children}) => (
  <label>
    <span style={labelStyle}>{label}</span>
    {children}
  </label>
);

// 支持通过 URL 预填初始表单，便于分享带预设的编辑器链接（如 ?template=drama&title=...）。
const initialForm = (): Form => {
  if (typeof location === 'undefined') return INITIAL;
  const p = new URLSearchParams(location.search);
  return {
    ...INITIAL,
    template: p.get('template') || INITIAL.template,
    mainTitle: p.get('title') || INITIAL.mainTitle,
    mainAuthor: p.get('author') || INITIAL.mainAuthor,
    mainZh: p.get('zh') || INITIAL.mainZh,
    mainEn: p.get('en') || INITIAL.mainEn,
  };
};

export const App: React.FC = () => {
  const [form, setForm] = useState<Form>(initialForm);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({...f, [key]: value}));

  const raw = useMemo(() => buildRaw(form), [form]);
  const duration = useMemo(() => durationForProps(propsFromRaw(raw)), [raw]);
  const lastCut = (raw.books as {flashCutFrames: number[]}).flashCutFrames.slice(-1)[0] ?? 0;
  const previewFrame = Math.min(duration - 1, lastCut + 12); // 预览默认停在主书页。

  const exportJson = useMemo(() => JSON.stringify({id: 'my-video', ...raw}, null, 2), [raw]);

  const copyExport = () => {
    navigator.clipboard?.writeText(exportJson).catch(() => undefined);
  };

  // 本地服务：探活 + 一键渲染 MP4。纯静态打开时按钮不可用。
  const [apiOk, setApiOk] = useState(false);
  const [render, setRender] = useState<{status: 'idle' | 'rendering' | 'done' | 'error'; url?: string; error?: string}>({status: 'idle'});
  useEffect(() => {
    fetch('/api/health')
      .then((r) => setApiOk(r.ok))
      .catch(() => setApiOk(false));
  }, []);
  const renderNow = async () => {
    setRender({status: 'rendering'});
    try {
      const res = await fetch('/api/render', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({id: form.mainTitle, ...raw})});
      const data = await res.json();
      if (data.ok) setRender({status: 'done', url: data.url});
      else setRender({status: 'error', error: data.error || '渲染失败'});
    } catch (e) {
      setRender({status: 'error', error: String(e)});
    }
  };

  return (
    <div style={{display: 'flex', height: '100vh', fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif', color: '#1b2430'}}>
      {/* 编辑面板 */}
      <div style={{width: 380, padding: '20px 22px', overflowY: 'auto', borderRight: '1px solid #e6eaf0', background: '#f7f9fc'}}>
        <h1 style={{fontSize: 18, margin: '0 0 4px'}}>书籍短视频编辑器</h1>
        <div style={{fontSize: 12, color: '#8a93a0'}}>编辑 → 实时预览 → 导出配置给批量引擎</div>

        <Field label="模板风格">
          <select style={inputStyle} value={form.template} onChange={(e) => set('template', e.target.value)}>
            {templateIds().map((id) => (
              <option key={id} value={id}>
                {id} · {getTemplate(id).label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="背景音乐（相对 public / 或 asset 引用）">
          <input style={inputStyle} value={form.audio} onChange={(e) => set('audio', e.target.value)} />
        </Field>

        <Field label="主书 · 书名">
          <input style={inputStyle} value={form.mainTitle} onChange={(e) => set('mainTitle', e.target.value)} />
        </Field>
        <Field label="主书 · 作者">
          <input style={inputStyle} value={form.mainAuthor} onChange={(e) => set('mainAuthor', e.target.value)} />
        </Field>
        <Field label="主书 · 中文金句">
          <input style={inputStyle} value={form.mainZh} onChange={(e) => set('mainZh', e.target.value)} />
        </Field>
        <Field label="主书 · 英文金句">
          <input style={inputStyle} value={form.mainEn} onChange={(e) => set('mainEn', e.target.value)} />
        </Field>

        <Field label="快闪书单（每行一本：书名 | 作者）">
          <textarea style={{...inputStyle, height: 110, resize: 'vertical', fontFamily: 'inherit'}} value={form.flashBooksText} onChange={(e) => set('flashBooksText', e.target.value)} />
        </Field>

        <Field label="开场字幕 · 中文">
          <input style={inputStyle} value={form.subZh} onChange={(e) => set('subZh', e.target.value)} />
        </Field>
        <Field label="开场字幕 · 英文">
          <input style={inputStyle} value={form.subEn} onChange={(e) => set('subEn', e.target.value)} />
        </Field>

        <div style={{display: 'flex', gap: 16, marginTop: 14, alignItems: 'center'}}>
          <label style={{fontSize: 13}}>
            <input type="checkbox" checked={form.showSubtitles} onChange={(e) => set('showSubtitles', e.target.checked)} /> 显示字幕
          </label>
          <label style={{fontSize: 13}}>
            开场
            <select style={{marginLeft: 6, padding: '3px 6px'}} value={form.introMode} onChange={(e) => set('introMode', e.target.value as Form['introMode'])}>
              <option value="generated">生成式</option>
              <option value="video">本地视频</option>
            </select>
          </label>
        </div>
      </div>

      {/* 预览 */}
      <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#11151c'}}>
        <div style={{boxShadow: '0 20px 60px rgba(0,0,0,0.5)', borderRadius: 12, overflow: 'hidden'}}>
          <Player
            component={BookIntroFromConfig}
            inputProps={raw as Record<string, unknown>}
            durationInFrames={duration}
            compositionWidth={720}
            compositionHeight={1280}
            fps={FPS}
            initialFrame={previewFrame}
            style={{width: 288, height: 512}}
            controls
            loop
          />
        </div>
      </div>

      {/* 渲染 + 导出 */}
      <div style={{width: 320, padding: '20px 18px', borderLeft: '1px solid #e6eaf0', background: '#f7f9fc', display: 'flex', flexDirection: 'column'}}>
        <h2 style={{fontSize: 15, margin: '0 0 8px'}}>渲染 MP4</h2>
        {apiOk ? (
          <button
            id="render-btn"
            onClick={renderNow}
            disabled={render.status === 'rendering'}
            style={{padding: '9px 12px', border: 'none', borderRadius: 8, background: render.status === 'rendering' ? '#9bb4e8' : '#16a34a', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600}}
          >
            {render.status === 'rendering' ? '渲染中…（约 15s）' : '渲染此配置为 MP4'}
          </button>
        ) : (
          <div style={{fontSize: 12, color: '#8a93a0', lineHeight: 1.6}}>
            未连接本地服务。运行 <code>npm run gui:build</code> 后 <code>node scripts/server.mjs</code>，用 :4000 打开即可一键渲染。
          </div>
        )}
        {render.status === 'done' && render.url ? (
          <div id="render-result" style={{marginTop: 12}}>
            <video src={render.url} controls style={{width: '100%', borderRadius: 8, background: '#000'}} />
            <a href={render.url} download style={{fontSize: 13, color: '#2f6bff'}}>
              下载 MP4
            </a>
          </div>
        ) : null}
        {render.status === 'error' ? <div style={{marginTop: 10, fontSize: 12, color: '#d33'}}>渲染失败：{render.error}</div> : null}

        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20}}>
          <h2 style={{fontSize: 15, margin: 0}}>导出配置</h2>
          <button id="copy-btn" onClick={copyExport} style={{padding: '6px 12px', border: 'none', borderRadius: 8, background: '#2f6bff', color: '#fff', fontSize: 13, cursor: 'pointer'}}>
            复制
          </button>
        </div>
        <div style={{fontSize: 12, color: '#8a93a0', margin: '6px 0 10px'}}>把它作为批量数据的一项（JSON 数组元素）喂给 render-batch。</div>
        <pre id="export-json" style={{flex: 1, margin: 0, overflow: 'auto', background: '#0f1620', color: '#cfe3ff', padding: 12, borderRadius: 8, fontSize: 11, lineHeight: 1.5}}>
          {exportJson}
        </pre>
      </div>
    </div>
  );
};
