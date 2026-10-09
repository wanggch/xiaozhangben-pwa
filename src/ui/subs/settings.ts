/** 设置 / 关于 / 添加到主屏幕 */
import { S, save, isMemoryOnly } from '../../data/store';
import { SUB, segHTML, toast, renderSub, top } from '../app';
import { $, esc } from '../dom';
import { ico } from '../icons';
import { CURRENCIES } from '../../core/constants';
import { getAcct, hasSample } from '../../core/ledger';
import { applyTheme } from '../theme';
import { checkReminder } from '../reminder';
import { APP_VERSION } from '../../version';
import { canPrompt, isAndroid, isIOS, isIOSSafari, isStandalone, isWeChat, onInstallChange } from '../../pwa/install';

SUB.settings = () => {
  const st = S.settings;
  const li = (icon: string, name: string, rv: string, attr = '', cls = '') => `<button class="li ${cls}" ${attr}>${ico(icon)}<span class="grow">${name}</span><span class="rv">${rv}</span></button>`;
  return {
    title: '设置', body: `
    <div class="group-t" style="margin-top:8px"><span>通用</span></div>
    <div class="group">
      ${li('globe', '货币符号', `${esc(st.currency)} ${esc((CURRENCIES.find(c => c[0] === st.currency) || ['', '自定义'])[1])}${ico('right')}`, 'data-act="currency"')}
      ${li('wallet', '记账默认账户', `${esc(getAcct(S, st.defaultAcct)?.name || '不选择')}${ico('right')}`, 'data-act="defaultAcct"')}
      <div class="li">${ico('calendar')}<span class="grow">每周第一天</span>${segHTML('weekStart', [[1, '周一'], [0, '周日']], st.weekStart, 'sm', '每周第一天')}</div>
      <div class="li">${ico('moon')}<span class="grow">外观</span>${segHTML('theme', [['auto', '自动'], ['light', '浅色'], ['dark', '深色']], st.theme, 'sm', '外观')}</div>
    </div>
    <div class="group-t"><span>提醒</span></div>
    <div class="group">
      <div class="li">${ico('bell')}<span class="grow">每日记账提醒<span class="sm">打开 App 时提醒 · 网页应用无法在关闭时定时推送</span></span><button class="switch ${st.remind ? 'on' : ''}" role="switch" aria-checked="${st.remind}" data-act="toggleRemind" aria-label="每日提醒"></button></div>
      ${st.remind ? `<label class="li">${ico('clock')}<span class="grow">提醒时间</span><input type="time" id="remindTime" value="${st.remindTime}" class="input" style="width:110px;height:38px;text-align:center"/></label>` : ''}
    </div>
    <div class="group-t"><span>安全</span></div>
    <div class="group">
      <div class="li">${ico('lock')}<span class="grow">应用锁<span class="sm">打开 App 或离开超过 1 分钟后需输入 4 位密码</span></span><button class="switch ${st.lock ? 'on' : ''}" role="switch" aria-checked="${st.lock}" data-act="toggleLock" aria-label="应用锁"></button></div>
      ${st.lock ? li('edit', '修改密码', ico('right'), 'data-act="changePin"') + li('lock', '立即锁定', ico('right'), 'data-act="lockNow"') : ''}
    </div>
    <div class="group-t"><span>数据</span></div>
    <div class="group">
      ${li('download', '导出 CSV', '表格查看' + ico('right'), 'data-act="exportCSV"')}
      ${li('download', '导出 JSON 备份', '完整数据' + ico('right'), 'data-act="exportJSON"')}
      ${li('upload', '导入数据', 'JSON / CSV' + ico('right'), 'data-act="import"')}
      ${hasSample(S) ? li('layers', '清除示例数据', ico('right'), 'data-act="clearSample"') : li('refresh', '载入示例数据', ico('right'), 'data-act="loadSample"')}
      ${li('trash', '清空全部数据', '', 'data-act="clearAll"', 'danger')}
    </div>
    <div class="group-t"><span>关于</span></div>
    <div class="group">${li('phone', '添加到主屏幕', (isStandalone() ? '已添加' : '') + ico('right'), 'data-go="install"')}${li('info', '关于小账本', 'v' + APP_VERSION + ico('right'), 'data-go="about"')}${li('sparkle', '重新查看引导页', ico('right'), 'data-act="onboard"')}</div>
    <div class="hint" style="margin-top:24px">${isMemoryOnly() ? '<span class="offline-dot"></span>当前浏览器不支持本地数据库，数据仅在本次打开期间有效' : '所有设置即时生效并保存在本机 · 建议定期导出备份'}</div>`,
    mount(el) {
      $('.seg[data-seg="weekStart"]', el).addEventListener('segchange', e => { const v = (e as CustomEvent).detail; S.settings.weekStart = v === '0' ? 0 : 1; save(); toast('已设置每周从' + (v === '1' ? '周一' : '周日') + '开始'); });
      $('.seg[data-seg="theme"]', el).addEventListener('segchange', e => { S.settings.theme = (e as CustomEvent).detail; save(); applyTheme(); });
      const t = $<HTMLInputElement>('#remindTime', el);
      t && t.addEventListener('change', () => { if (!t.value) return; S.settings.remindTime = t.value; S.meta.lastRemindDate = undefined; save(); checkReminder(); toast(`将在每天 ${t.value} 后打开 App 时提醒你记账`); });
    },
  };
};

SUB.about = () => ({
  title: '关于', body: `
  <div class="app-ico" aria-hidden="true">${ico('receipt')}</div>
  <div class="about-t"><h3>小账本</h3><p>版本 ${APP_VERSION} · 离线可用的网页 App</p></div>
  <div class="group" style="margin-top:26px"><p class="para">一个克制、安静的记账工具：大号等宽数字、一个主色、线性图标，把注意力留给你的每一笔。<br/>支持多账本、多账户、预算、周期账单、日历与统计。</p></div>
  <div class="group">
    <div class="li">${ico('lock')}<span class="grow">数据存储</span><span class="rv">仅本机 IndexedDB</span></div>
    <div class="li">${ico('layers')}<span class="grow">账单总数</span><span class="rv num">${S.tx.length} 笔</span></div>
    <button class="li" data-act="onboard">${ico('sparkle')}<span class="grow">查看引导页</span><span class="rv">${ico('right')}</span></button>
  </div>
  <div class="hint" style="margin-top:26px">Designed &amp; vibe-coded by 曦林</div>`,
});

SUB.install = (_p, pg) => {
  onInstallChange(() => { if (pg.el.isConnected && top() === pg) renderSub(pg); });
  const share = `<span class="kbd-ico"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg></span>`;
  const plusBox = `<span class="kbd-ico"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg></span>`;
  const more = `<span class="kbd-ico">${ico('more')}</span>`;
  let body: string;
  if (isStandalone()) body = `<div class="empty"><div class="ill">${ico('check')}</div>已经添加到主屏幕<br/>现在就是全屏 App 模式，离线也能使用</div>`;
  else if (isWeChat()) body = `<div class="group"><p class="para">微信内置浏览器不支持添加到主屏幕。请点右上角 ${more}，选择「在浏览器中打开」，再按提示添加。</p></div>`;
  else if (isIOS()) body = `<div class="card" style="margin-top:6px"><ol class="install-steps">
      ${isIOSSafari() ? '' : '<li>建议用 Safari 打开本页（iOS 16.4 起其他浏览器的分享菜单也支持）</li>'}
      <li>点击浏览器底部（iPad 在顶部）的「分享」按钮 ${share}</li>
      <li>向下滑动，选择「添加到主屏幕」 ${plusBox}</li>
      <li>点击右上角「添加」，之后从主屏幕图标打开即可全屏使用</li></ol></div>
      <p class="hint" style="text-align:left;margin-top:14px">添加后数据仍然只保存在这台设备上。iOS 的主屏幕 App 与 Safari 中的数据彼此独立，建议添加后再开始记账，或通过导出 / 导入迁移。</p>`;
  else if (canPrompt()) body = `<div class="card" style="margin-top:6px;text-align:center"><div class="app-ico" style="margin-top:4px" aria-hidden="true">${ico('receipt')}</div><p class="para" style="padding-bottom:6px">安装后可以从桌面图标直接打开，全屏显示，离线也能记账。</p><button class="btn" data-act="install">${ico('download')}安装小账本</button></div>`;
  else body = `<div class="card" style="margin-top:6px"><ol class="install-steps">
      <li>点击浏览器右上角的菜单 ${more}</li>
      <li>选择「安装应用」或「添加到主屏幕」</li>
      <li>确认后，从桌面图标打开即可全屏使用</li></ol></div>
      <p class="hint" style="text-align:left;margin-top:14px">${isAndroid() ? '推荐使用 Chrome / Edge。部分国产浏览器不支持安装网页 App。' : '桌面版 Chrome / Edge 也可以在地址栏右侧点击安装图标。'}</p>`;
  return { title: '添加到主屏幕', body };
};
