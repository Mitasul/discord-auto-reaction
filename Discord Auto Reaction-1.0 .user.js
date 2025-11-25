// ==UserScript==
// @name         Discord Auto Reaction
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto add emoji reactions to messages
// @author       FFFLORRA
// @match        https://discord.com/channels/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * ================================================================================
 * Discord Auto Reaction - 自动表情反应脚本
 * ================================================================================
 *
 * 原作者: FFFLORRA
 * 版本: 1.0
 *
 * 开源项目 - 欢迎使用和修改
 * 二次修改请保留原作者信息
 *
 * 免责声明:
 * 本脚本仅供学习交流使用,仅限与朋友娱乐。
 * 使用本脚本可能违反Discord服务条款,被检测封号概不负责。
 * 作者不对使用本脚本造成的任何后果负责。
 *
 * ================================================================================
 */

(function () {
    'use strict';

    // Token桥接注入
    let bridgeInjected = false;
    function injectTokenBridge() {
        if (bridgeInjected) return;
        bridgeInjected = true;
        const s = document.createElement('script');
        s.textContent = '(function(){function send(){try{window.postMessage({type:"POOP_TOKEN",token:localStorage.getItem("token")},"*")}catch(e){}}send();setInterval(send,2000)})();';
        (document.head || document.documentElement).appendChild(s);
        setTimeout(function() { s.remove(); }, 0);
    }

    window.addEventListener('message', function(e) {
        const d = e && e.data;
        if (!d || d.type !== 'POOP_TOKEN') return;
        let t = d.token;
        if (!t) return;
        try { t = JSON.parse(t); } catch(ex) { t = String(t).replace(/^"+|"+$/g, ''); }
        if (t && t !== authToken) {
            authToken = t;
            console.log('[Discord Auto Reaction] Token获取成功');
        }
    });

    var KEYS = {
        TARGETS: 'discord_poop_targets',
        ENABLED: 'discord_poop_enabled',
        DELAY: 'discord_poop_delay_ms',
        ALL_USERS: 'discord_poop_all_users',
        CHANNELS: 'discord_poop_channel_ids',
        FAB_POS: 'discord_poop_fab_pos',
        USER_MAP: 'discord_poop_user_enabled_map',
        CHANNEL_MAP: 'discord_poop_channel_enabled_map',
        EMOJIS: 'discord_poop_emojis',
        EMOJI_MAP: 'discord_poop_emoji_enabled_map',
        PANEL_POS: 'discord_poop_panel_pos',
        TOKEN: 'discord_poop_manual_token',
        GUILD_ID: 'discord_poop_guild_id'
    };

    var DEFAULT_EMOJIS = [
        { type: 'unicode', emoji: '\uD83D\uDCA9', name: 'poop', animated: false, enabled: true }
    ];

    var authToken = null;
    var isEnabled = localStorage.getItem(KEYS.ENABLED) === 'true';
    var userDelayMs = Number(localStorage.getItem(KEYS.DELAY)) || 800;
    var targetUserIds = JSON.parse(localStorage.getItem(KEYS.TARGETS) || '[]');
    var isAllUsers = localStorage.getItem(KEYS.ALL_USERS) === 'true';
    var manualChannelIds = JSON.parse(localStorage.getItem(KEYS.CHANNELS) || '[]');
    var userEnabledMap = JSON.parse(localStorage.getItem(KEYS.USER_MAP) || '{}');
    var channelEnabledMap = JSON.parse(localStorage.getItem(KEYS.CHANNEL_MAP) || '{}');
    var emojiList = JSON.parse(localStorage.getItem(KEYS.EMOJIS) || 'null') || DEFAULT_EMOJIS;
    var emojiEnabledMap = JSON.parse(localStorage.getItem(KEYS.EMOJI_MAP) || '{}');
    var manualToken = localStorage.getItem(KEYS.TOKEN) || '';
    var manualGuildId = localStorage.getItem(KEYS.GUILD_ID) || '';

    var processedIds = new Set();
    var scheduledIds = new Set();
    var messageObserver = null;
    var fabEl = null;
    var panelVisible = false;
    var pollTimer = null;

    var POOP_SVG = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 3c1.8 0 3 1.2 3 2.4 0 .9-.5 1.5-1 1.9 2 .3 3.6 1.9 3.8 3.9 2.2.6 3.7 2.5 3.7 4.6 0 2.7-2.5 5.2-6.5 5.2H8c-4 0-6.5-2.5-6.5-5.2 0-2.1 1.5-3.9 3.7-4.6.2-2 1.8-3.6 3.8-3.9-.5-.4-1-1-1-1.9C8 4.2 9.2 3 11 3h1z" fill="#8B4513"/><circle cx="9" cy="15" r="1" fill="#fff"/><circle cx="15" cy="15" r="1" fill="#fff"/></svg>';

    function save(key, val) { try { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); } catch(e) {} }
    function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 900; }
    function isUserEnabled(id) { return userEnabledMap[id] !== false; }
    function isChannelEnabled(id) { return channelEnabledMap[id] !== false; }
    
    function isEmojiEnabled(emoji) { 
        if (emojiEnabledMap[emoji] !== undefined) return emojiEnabledMap[emoji];
        for (var i = 0; i < emojiList.length; i++) {
            if (emojiList[i].emoji === emoji) return emojiList[i].enabled !== false;
        }
        return true;
    }
    
    function getEnabledEmojis() { 
        var result = [];
        for (var i = 0; i < emojiList.length; i++) {
            if (isEmojiEnabled(emojiList[i].emoji)) result.push(emojiList[i]);
        }
        return result;
    }

    function parseEmojiInput(input) {
        input = input.trim();
        var discordMatch = input.match(/^<(a)?:(\w+):(\d+)>$/);
        if (discordMatch) {
            return { type: 'custom', emoji: discordMatch[2] + ':' + discordMatch[3], name: discordMatch[2], animated: !!discordMatch[1] };
        }
        var simpleMatch = input.match(/^(\w+):(\d+)$/);
        if (simpleMatch) {
            return { type: 'custom', emoji: input, name: simpleMatch[1], animated: false };
        }
        if (input.length <= 4) {
            return { type: 'unicode', emoji: input, name: input, animated: false };
        }
        return null;
    }

    function buildEmojiForApi(emojiItem) {
        return emojiItem.type === 'unicode' ? encodeURIComponent(emojiItem.emoji) : emojiItem.emoji;
    }

    function readToken() {
        if (manualToken) return manualToken;
        try {
            var raw = localStorage.getItem('token');
            if (raw) {
                try { return JSON.parse(raw); }
                catch(e) { return String(raw).replace(/^"+|"+$/g, ''); }
            }
        } catch(e) {}
        return null;
    }

    function addSingleReaction(channelId, messageId, emojiItem) {
        return new Promise(function(resolve) {
            if (!authToken) { resolve(false); return; }
            var emojiStr = buildEmojiForApi(emojiItem);
            var url = 'https://discord.com/api/v10/channels/' + channelId + '/messages/' + messageId + '/reactions/' + emojiStr + '/@me';
            fetch(url, { method: 'PUT', headers: { 'Authorization': authToken } })
            .then(function(res) {
                if (res.status === 429) {
                    res.json().then(function(data) {
                        if (data.retry_after) {
                            setTimeout(function() { addSingleReaction(channelId, messageId, emojiItem).then(resolve); }, data.retry_after * 1000 + 100);
                        } else { resolve(false); }
                    }).catch(function() { resolve(false); });
                } else { resolve(res.status === 204); }
            }).catch(function() { resolve(false); });
        });
    }

    function addReaction(channelId, messageId) {
        return new Promise(function(resolve) {
            var enabledEmojis = getEnabledEmojis();
            if (enabledEmojis.length === 0) { resolve(false); return; }
            var success = false, idx = 0;
            function next() {
                if (idx >= enabledEmojis.length) { resolve(success); return; }
                addSingleReaction(channelId, messageId, enabledEmojis[idx]).then(function(ok) {
                    if (ok) success = true;
                    idx++;
                    if (enabledEmojis.length > 1 && idx < enabledEmojis.length) { setTimeout(next, 300); } 
                    else { next(); }
                });
            }
            next();
        });
    }

    function shouldReact(authorId) {
        if (!isEnabled) return false;
        if (getEnabledEmojis().length === 0) return false;
        if (isAllUsers) {
            console.log('[Discord Auto Reaction] 所有用户模式,匹配作者:', authorId);
            return true;
        }
        if (!authorId) return false;
        if (targetUserIds.length === 0) return true;
        var matched = targetUserIds.indexOf(authorId) !== -1 && isUserEnabled(authorId);
        console.log('[Discord Auto Reaction] 仅标记用户模式,作者:', authorId, '匹配:', matched);
        return matched;
    }

    function handleMessage(channelId, messageId, authorId) {
        var key = channelId + ':' + messageId;
        if (processedIds.has(key) || scheduledIds.has(key)) return;
        if (!shouldReact(authorId)) return;
        if (manualChannelIds.length > 0 && (manualChannelIds.indexOf(channelId) === -1 || !isChannelEnabled(channelId))) return;
        scheduledIds.add(key);
        setTimeout(function() {
            addReaction(channelId, messageId).then(function(ok) {
                scheduledIds.delete(key);
                if (ok) processedIds.add(key);
            });
        }, userDelayMs);
    }

    function startObserver() {
        stopObserver();
        var root = document.querySelector('ol[data-list-id="chat-messages"]');
        if (!root) {
            console.log('[Discord Auto Reaction] 未找到消息列表,1秒后重试');
            setTimeout(startObserver, 1000);
            return;
        }
        console.log('[Discord Auto Reaction] DOM监听已启动');
        messageObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (!(node instanceof Element)) return;
                    var items = node.tagName === 'LI' ? [node] : node.querySelectorAll('li[id^="chat-messages-"]');
                    for (var i = 0; i < items.length; i++) {
                        var li = items[i];
                        var match = (li.id || '').match(/^chat-messages-(\d+)-(\d+)/);
                        if (!match) continue;
                        var el = li.querySelector('[data-user-id]');
                        var authorId = el ? el.getAttribute('data-user-id') : null;
                        console.log('[Discord Auto Reaction] 检测到新消息:', match[1], match[2], '作者:', authorId);
                        handleMessage(match[1], match[2], authorId);
                    }
                });
            });
        });
        messageObserver.observe(root, { childList: true, subtree: true });
    }

    function stopObserver() { if (messageObserver) { messageObserver.disconnect(); messageObserver = null; } }

    async function fetchGuildChannels(guildId) {
        if (!authToken || !guildId) return [];
        try {
            var res = await fetch('https://discord.com/api/v10/guilds/' + guildId + '/channels', { headers: { 'Authorization': authToken } });
            if (!res.ok) return [];
            var data = await res.json();
            return Array.isArray(data) ? data.filter(function(ch) { return ch && (ch.type === 0 || ch.type === 5) && ch.id; }).map(function(ch) { return String(ch.id); }) : [];
        } catch(e) { return []; }
    }

    async function fetchLatestMessages(channelId, limit) {
        if (!authToken) return [];
        try {
            var res = await fetch('https://discord.com/api/v10/channels/' + channelId + '/messages?limit=' + (limit || 50), { headers: { 'Authorization': authToken } });
            if (!res.ok) return [];
            var data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch(e) { return []; }
    }

    var lastSeenByChannel = {};
    
    function startPolling() {
        stopPolling();
        if (!manualGuildId) {
            console.log('[Discord Auto Reaction] 未填写服务器ID,无法启动API模式');
            return;
        }
        authToken = readToken();
        if (!authToken) {
            console.log('[Discord Auto Reaction] 未获取到Token,无法启动API模式');
            injectTokenBridge();
            return;
        }
        
        console.log('[Discord Auto Reaction] API轮询已启动,服务器ID:', manualGuildId);
        
        pollTimer = setInterval(async function() {
            if (!isEnabled) return;
            authToken = readToken();
            if (!authToken) return;
            
            var channels = manualChannelIds.length > 0 ? manualChannelIds : await fetchGuildChannels(manualGuildId);
            if (!channels || channels.length === 0) {
                console.log('[Discord Auto Reaction] 未找到频道');
                return;
            }
            
            console.log('[Discord Auto Reaction] 轮询频道数:', channels.length);
            
            for (var i = 0; i < channels.length; i++) {
                var channelId = channels[i];
                if (manualChannelIds.length > 0 && !isChannelEnabled(channelId)) continue;
                
                var msgs = await fetchLatestMessages(channelId, 20);
                for (var j = msgs.length - 1; j >= 0; j--) {
                    var m = msgs[j];
                    if (!m || !m.id) continue;
                    
                    var lastSeen = lastSeenByChannel[channelId];
                    if (lastSeen && BigInt(m.id) <= BigInt(lastSeen)) continue;
                    
                    var authorId = m.author && m.author.id;
                    if (!shouldReact(authorId)) continue;
                    
                    var key = channelId + ':' + m.id;
                    if (processedIds.has(key) || scheduledIds.has(key)) continue;
                    
                    console.log('[Discord Auto Reaction] 发现新消息:', channelId, m.id, '作者:', authorId);
                    
                    scheduledIds.add(key);
                    (async function(cid, mid, k) {
                        var ok = await addReaction(cid, mid);
                        scheduledIds.delete(k);
                        if (ok) {
                            processedIds.add(k);
                            console.log('[Discord Auto Reaction] 反应成功:', cid, mid);
                        }
                    })(channelId, m.id, key);
                    
                    lastSeenByChannel[channelId] = m.id;
                }
            }
        }, 3000);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    function toggleEnabled() {
        isEnabled = !isEnabled;
        save(KEYS.ENABLED, String(isEnabled));
        updateUI();
        
        if (isEnabled) {
            authToken = readToken();
            if (!authToken) {
                injectTokenBridge();
                showToast('正在获取Token...', 'warn');
                setTimeout(function() {
                    authToken = readToken();
                    if (!authToken) {
                        showToast('Token获取失败,请手动填写', 'error');
                        isEnabled = false;
                        save(KEYS.ENABLED, 'false');
                        updateUI();
                        return;
                    }
                    if (manualGuildId) {
                        console.log('[Discord Auto Reaction] 启动API轮询模式,服务器ID:', manualGuildId);
                        startPolling();
                        showToast('已开启(API模式)', 'success');
                    } else {
                        console.log('[Discord Auto Reaction] 启动DOM监听模式');
                        startObserver();
                        showToast('已开启(DOM模式)', 'success');
                    }
                }, 1000);
            } else {
                if (manualGuildId) {
                    console.log('[Discord Auto Reaction] 启动API轮询模式,服务器ID:', manualGuildId);
                    startPolling();
                    showToast('已开启(API模式)', 'success');
                } else {
                    console.log('[Discord Auto Reaction] 启动DOM监听模式');
                    startObserver();
                    showToast('已开启(DOM模式)', 'success');
                }
            }
        } else {
            stopObserver();
            stopPolling();
            showToast('已关闭', 'warn');
        }
    }

    function updateUI() {
        if (fabEl) {
            var c = isEnabled ? '#57F287' : '#4f545c';
            fabEl.style.boxShadow = '0 8px 24px rgba(0,0,0,.35), 0 0 0 3px ' + c + ' inset';
            fabEl.style.opacity = isEnabled ? '1' : '.8';
        }
        var btn = document.getElementById('poop-toggle');
        if (btn) {
            btn.textContent = isEnabled ? '关闭' : '开启';
            btn.style.background = isEnabled ? '#57F287' : '#5865F2';
            btn.style.color = isEnabled ? '#16181a' : '#fff';
        }
        var allBtn = document.getElementById('poop-all-users');
        if (allBtn) {
            allBtn.textContent = isAllUsers ? '所有用户' : '仅标记用户';
            allBtn.style.background = isAllUsers ? '#57F287' : '#4f545c';
            allBtn.style.color = isAllUsers ? '#16181a' : '#fff';
        }
    }

    function showToast(msg, type) {
        var el = document.createElement('div');
        var bg = type === 'success' ? '#57F287' : type === 'warn' ? '#FEE75C' : '#ED4245';
        el.textContent = msg;
        el.style.cssText = 'position:fixed;top:24px;right:24px;padding:12px 20px;background:' + bg + ';color:' + (type === 'warn' ? '#16181a' : '#fff') + ';border-radius:8px;z-index:2147483647;font-size:14px;';
        document.body.appendChild(el);
        setTimeout(function() { el.remove(); }, 2200);
    }

    function togglePanel() {
        var panel = document.getElementById('poop-panel');
        if (!panel) { buildPanel(); panel = document.getElementById('poop-panel'); }
        panelVisible = !panelVisible;
        panel.style.display = panelVisible ? 'block' : 'none';
        if (panelVisible) { renderEmojiList(); renderChannelList(); renderUserList(); }
    }

    function buildFab() {
        if (fabEl && document.body.contains(fabEl)) return;
        var fab = document.createElement('div');
        fab.id = 'poop-fab';
        fab.innerHTML = POOP_SVG;
        var pos = null;
        try { pos = JSON.parse(localStorage.getItem(KEYS.FAB_POS)); } catch (e) {}
        var posStyle = pos ? 'left:' + pos.left + 'px;top:' + pos.top + 'px;' : 'right:24px;bottom:24px;';
        fab.style.cssText = 'position:fixed;' + posStyle + 'width:56px;height:56px;border-radius:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2147483647;background:linear-gradient(135deg,#2f3136,#202225);user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;transition:transform 0.1s ease;';
        var drag = { active: false, moved: false, sx: 0, sy: 0, sl: 0, st: 0, startTime: 0 };
        function getPos(e) {
            if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        }
        function onStart(e) {
            drag.active = true;
            drag.moved = false;
            drag.startTime = Date.now();
            var p = getPos(e);
            drag.sx = p.x;
            drag.sy = p.y;
            var r = fab.getBoundingClientRect();
            drag.sl = r.left;
            drag.st = r.top;
            fab.style.transform = 'scale(0.95)';
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('mousemove', onMove);
            document.addEventListener('touchend', onEnd);
            document.addEventListener('mouseup', onEnd);
        }
        function onMove(e) {
            if (!drag.active) return;
            var p = getPos(e), dx = p.x - drag.sx, dy = p.y - drag.sy;
            if (Math.abs(dx) + Math.abs(dy) > 8) {
                drag.moved = true;
                if (e.cancelable) e.preventDefault();
            }
            if (drag.moved) {
                fab.style.left = Math.max(4, Math.min(window.innerWidth - 60, drag.sl + dx)) + 'px';
                fab.style.top = Math.max(4, Math.min(window.innerHeight - 60, drag.st + dy)) + 'px';
                fab.style.right = 'auto';
                fab.style.bottom = 'auto';
            }
        }
        function onEnd(e) {
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchend', onEnd);
            document.removeEventListener('mouseup', onEnd);
            if (!drag.active) return;
            drag.active = false;
            fab.style.transform = 'scale(1)';
            var duration = Date.now() - drag.startTime;
            if (!drag.moved && duration < 300) {
                if (e.cancelable) e.preventDefault();
                togglePanel();
            } else if (drag.moved) {
                var r = fab.getBoundingClientRect();
                save(KEYS.FAB_POS, { left: Math.round(r.left), top: Math.round(r.top) });
            }
        }
        fab.addEventListener('touchstart', onStart, { passive: true });
        fab.addEventListener('mousedown', onStart);
        document.body.appendChild(fab);
        fabEl = fab;
        updateUI();
    }

    function buildPanel() {
        if (document.getElementById('poop-panel')) return;
        var m = isMobile();
        var panel = document.createElement('div');
        panel.id = 'poop-panel';
        var ps = 'position:fixed;background:#2f3136;z-index:2147483647;display:none;color:#dcddde;box-shadow:0 12px 40px rgba(0,0,0,.5);-webkit-overflow-scrolling:touch;';
        if (m) {
            ps += 'top:0;left:0;right:0;bottom:0;width:100%;height:100%;overflow-y:auto;overflow-x:hidden;';
        } else {
            var savedPos = null;
            try { savedPos = JSON.parse(localStorage.getItem(KEYS.PANEL_POS)); } catch(e) {}
            if (savedPos && savedPos.left !== undefined && savedPos.top !== undefined) {
                ps += 'left:' + savedPos.left + 'px;top:' + savedPos.top + 'px;';
            } else {
                ps += 'top:50%;left:50%;transform:translate(-50%,-50%);';
            }
            ps += 'width:480px;max-width:calc(100% - 40px);border-radius:10px;max-height:90vh;overflow-y:auto;overflow-x:hidden;';
        }
        panel.style.cssText = ps;
        var bp = m ? '12px 16px' : '8px 12px';
        var mh = m ? '44px' : 'auto';
        var fs = m ? '16px' : '14px';
        
        var h = '<div style="padding:' + (m ? '20px 16px' : '16px') + ';min-height:100%;">';
        h += '<div id="poop-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;' + (m ? '' : 'cursor:move;user-select:none;-webkit-user-select:none;') + '"><strong style="font-size:' + (m ? '20px' : '18px') + ';">自动反应设置</strong><button id="poop-close" style="background:none;border:none;color:#b9bbbe;font-size:' + (m ? '32px' : '24px') + ';cursor:pointer;padding:4px 8px;min-width:' + (m ? '44px' : 'auto') + ';min-height:' + (m ? '44px' : 'auto') + ';">×</button></div>';
        h += '<div style="margin-bottom:16px;padding:12px;background:#ED4245;border-radius:8px;font-size:' + (m ? '13px' : '12px') + ';line-height:1.5;color:#fff;">⚠️ <strong>免责声明:</strong><br/>本脚本仅供学习交流使用,仅限与朋友娱乐。使用本脚本可能违反Discord服务条款,被检测封号概不负责。请谨慎使用!</div>';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding:' + (m ? '14px' : '12px') + ';background:#202225;border-radius:8px;"><span style="font-size:' + fs + ';">自动反应</span><button id="poop-toggle" style="padding:' + bp + ';background:' + (isEnabled ? '#57F287' : '#5865F2') + ';border:none;border-radius:6px;color:' + (isEnabled ? '#16181a' : '#fff') + ';cursor:pointer;min-height:' + mh + ';min-width:' + (m ? '80px' : '60px') + ';font-weight:bold;font-size:' + fs + ';">' + (isEnabled ? '关闭' : '开启') + '</button></div>';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding:' + (m ? '14px' : '12px') + ';background:#202225;border-radius:8px;"><span style="font-size:' + fs + ';">匹配模式</span><button id="poop-all-users" style="padding:' + bp + ';background:' + (isAllUsers ? '#57F287' : '#4f545c') + ';border:none;border-radius:6px;color:' + (isAllUsers ? '#16181a' : '#fff') + ';cursor:pointer;min-height:' + mh + ';min-width:' + (m ? '120px' : '100px') + ';font-weight:bold;font-size:' + fs + ';">' + (isAllUsers ? '所有用户' : '仅标记用户') + '</button></div>';
        h += '<div style="margin-bottom:16px;padding:' + (m ? '14px' : '12px') + ';background:#202225;border-radius:8px;"><label style="display:block;margin-bottom:10px;color:#fff;font-weight:bold;font-size:' + fs + ';">手动Token:</label><input id="poop-token" type="text" placeholder="粘贴你的token" style="width:100%;padding:' + bp + ';border:1px solid #40444b;border-radius:6px;background:#40444b;color:#dcddde;font-size:' + fs + ';min-height:' + mh + ';box-sizing:border-box;" /></div>';
        h += '<div style="margin-bottom:16px;padding:' + (m ? '14px' : '12px') + ';background:#202225;border-radius:8px;"><label style="display:block;margin-bottom:10px;color:#fff;font-weight:bold;font-size:' + fs + ';">服务器ID <span style="color:#ED4245;">*</span>:</label><input id="poop-guild" type="text" placeholder="右键服务器图标→复制服务器ID" style="width:100%;padding:' + bp + ';border:1px solid #40444b;border-radius:6px;background:#40444b;color:#dcddde;font-size:' + fs + ';min-height:' + mh + ';box-sizing:border-box;" /></div>';
        h += '<div style="margin-bottom:16px;padding:' + (m ? '14px' : '12px') + ';background:#202225;border-radius:8px;"><label style="display:block;margin-bottom:10px;color:#fff;font-weight:bold;font-size:' + fs + ';">自定义表情 <span style="color:#ED4245;">*</span>:</label>';
        h += '<div style="font-size:' + (m ? '12px' : '11px') + ';color:#8e9297;margin-bottom:10px;line-height:1.4;">格式: 💩 | <a:nailong2:1402628167838994472> | name:id<br/>至少需要一个启用的表情才能生效</div>';
        h += '<div style="display:flex;gap:8px;margin-bottom:10px;"><input id="poop-new-emoji" type="text" placeholder="粘贴表情格式" style="flex:1;padding:' + bp + ';border:1px solid #40444b;border-radius:6px;background:#40444b;color:#dcddde;font-size:' + fs + ';min-height:' + mh + ';" /><button id="poop-add-emoji" style="padding:' + bp + ';background:#5865F2;border:none;border-radius:6px;color:#fff;cursor:pointer;min-height:' + mh + ';min-width:' + (m ? '70px' : '60px') + ';font-size:' + fs + ';">添加</button></div>';
        h += '<ul id="poop-emoji-list" style="list-style:none;padding:0;margin:0;max-height:' + (m ? '240px' : '180px') + ';overflow-y:auto;overflow-x:hidden;border:1px solid #40444b;border-radius:6px;-webkit-overflow-scrolling:touch;"></ul></div>';
        h += '<div style="margin-bottom:16px;padding:' + (m ? '14px' : '12px') + ';background:#202225;border-radius:8px;"><label style="display:block;margin-bottom:10px;color:#b9bbbe;font-size:' + fs + ';">延迟(ms):</label><input id="poop-delay" type="number" value="' + userDelayMs + '" style="width:100%;padding:' + bp + ';border:1px solid #40444b;border-radius:6px;background:#40444b;color:#dcddde;box-sizing:border-box;font-size:' + fs + ';min-height:' + mh + ';" /></div>';
        h += '<div style="margin-bottom:16px;padding:' + (m ? '14px' : '12px') + ';background:#202225;border-radius:8px;"><label style="display:block;margin-bottom:10px;color:#b9bbbe;font-size:' + fs + ';">频道ID:</label><div style="font-size:' + (m ? '12px' : '11px') + ';color:#8e9297;margin-bottom:8px;">留空=对整个服务器生效,添加后=仅对指定频道生效</div><div style="display:flex;gap:8px;margin-bottom:10px;"><input id="poop-new-channel" type="text" placeholder="频道ID" style="flex:1;padding:' + bp + ';border:1px solid #40444b;border-radius:6px;background:#40444b;color:#dcddde;font-size:' + fs + ';min-height:' + mh + ';" /><button id="poop-add-channel" style="padding:' + bp + ';background:#5865F2;border:none;border-radius:6px;color:#fff;cursor:pointer;min-height:' + mh + ';min-width:' + (m ? '70px' : '60px') + ';font-size:' + fs + ';">添加</button></div><ul id="poop-channel-list" style="list-style:none;padding:0;margin:0;max-height:' + (m ? '160px' : '100px') + ';overflow-y:auto;overflow-x:hidden;border:1px solid #40444b;border-radius:6px;-webkit-overflow-scrolling:touch;"></ul></div>';
        h += '<div style="margin-bottom:16px;padding:' + (m ? '14px' : '12px') + ';background:#202225;border-radius:8px;"><label style="display:block;margin-bottom:10px;color:#b9bbbe;font-size:' + fs + ';">用户ID:</label><div style="font-size:' + (m ? '12px' : '11px') + ';color:#8e9297;margin-bottom:8px;">仅在"仅标记用户"模式下生效,添加后只对这些用户反应</div><div style="display:flex;gap:8px;margin-bottom:10px;"><input id="poop-new-id" type="text" placeholder="用户ID" style="flex:1;padding:' + bp + ';border:1px solid #40444b;border-radius:6px;background:#40444b;color:#dcddde;font-size:' + fs + ';min-height:' + mh + ';" /><button id="poop-add-user" style="padding:' + bp + ';background:#5865F2;border:none;border-radius:6px;color:#fff;cursor:pointer;min-height:' + mh + ';min-width:' + (m ? '70px' : '60px') + ';font-size:' + fs + ';">添加</button></div><ul id="poop-user-list" style="list-style:none;padding:0;margin:0;max-height:' + (m ? '160px' : '100px') + ';overflow-y:auto;overflow-x:hidden;border:1px solid #40444b;border-radius:6px;-webkit-overflow-scrolling:touch;"></ul></div>';
        h += '<div style="display:flex;gap:12px;padding-bottom:' + (m ? '20px' : '0') + ';"><button id="poop-save" style="flex:1;padding:' + bp + ';background:#57F287;border:none;border-radius:6px;color:#16181a;cursor:pointer;font-weight:bold;min-height:' + mh + ';font-size:' + fs + ';">保存</button><button id="poop-cancel" style="padding:' + bp + ';background:#4f545c;border:none;border-radius:6px;color:#fff;cursor:pointer;min-height:' + mh + ';min-width:' + (m ? '80px' : '60px') + ';font-size:' + fs + ';">关闭</button></div>';
        h += '</div>';
        panel.innerHTML = h;
        document.body.appendChild(panel);
        bindPanelEvents();
        if (!m) setupPanelDrag(panel);
    }

    function setupPanelDrag(panel) {
        var header = document.getElementById('poop-header');
        if (!header) return;
        var drag = { active: false, sx: 0, sy: 0, sl: 0, st: 0 };
        function getPos(e) {
            if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        }
        function onStart(e) {
            if (e.target.id === 'poop-close') return;
            drag.active = true;
            var p = getPos(e);
            drag.sx = p.x;
            drag.sy = p.y;
            var r = panel.getBoundingClientRect();
            drag.sl = r.left;
            drag.st = r.top;
            panel.style.transform = 'none';
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
            e.preventDefault();
        }
        function onMove(e) {
            if (!drag.active) return;
            var p = getPos(e);
            var dx = p.x - drag.sx;
            var dy = p.y - drag.sy;
            var newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, drag.sl + dx));
            var newTop = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, drag.st + dy));
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
            if (e.cancelable) e.preventDefault();
        }
        function onEnd() {
            if (!drag.active) return;
            drag.active = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            var r = panel.getBoundingClientRect();
            save(KEYS.PANEL_POS, { left: Math.round(r.left), top: Math.round(r.top) });
        }
        header.addEventListener('mousedown', onStart);
        header.addEventListener('touchstart', onStart, { passive: false });
    }

    function bindPanelEvents() {
        function bindClick(id, fn) {
            var el = document.getElementById(id);
            if (el) { el.onclick = function(e) { e.preventDefault(); e.stopPropagation(); fn(); return false; }; }
        }
        bindClick('poop-toggle', toggleEnabled);
        bindClick('poop-close', togglePanel);
        bindClick('poop-cancel', togglePanel);
        bindClick('poop-all-users', function() {
            isAllUsers = !isAllUsers;
            save(KEYS.ALL_USERS, String(isAllUsers));
            updateUI();
            showToast(isAllUsers ? '匹配所有用户' : '仅匹配标记用户', 'success');
        });
        bindClick('poop-add-emoji', function() {
            var input = document.getElementById('poop-new-emoji');
            var val = (input.value || '').trim();
            if (!val) { showToast('请输入表情', 'error'); return; }
            var parsed = parseEmojiInput(val);
            if (!parsed) { showToast('格式无效', 'error'); return; }
            for (var i = 0; i < emojiList.length; i++) {
                if (emojiList[i].emoji === parsed.emoji) { showToast('已存在', 'error'); return; }
            }
            parsed.enabled = true;
            emojiList.push(parsed);
            emojiEnabledMap[parsed.emoji] = true;
            save(KEYS.EMOJIS, emojiList);
            save(KEYS.EMOJI_MAP, emojiEnabledMap);
            renderEmojiList();
            input.value = '';
            showToast('已添加', 'success');
        });
        bindClick('poop-add-channel', function() {
            var input = document.getElementById('poop-new-channel');
            var id = (input.value || '').trim();
            if (!/^\d{5,}$/.test(id)) { showToast('无效ID', 'error'); return; }
            if (manualChannelIds.indexOf(id) === -1) {
                manualChannelIds.push(id);
                channelEnabledMap[id] = true;
                save(KEYS.CHANNELS, manualChannelIds);
                save(KEYS.CHANNEL_MAP, channelEnabledMap);
                renderChannelList();
            }
            input.value = '';
        });
        bindClick('poop-add-user', function() {
            var input = document.getElementById('poop-new-id');
            var id = (input.value || '').trim();
            if (!/^\d{5,}$/.test(id)) { showToast('无效ID', 'error'); return; }
            if (targetUserIds.indexOf(id) === -1) {
                targetUserIds.push(id);
                userEnabledMap[id] = true;
                save(KEYS.TARGETS, targetUserIds);
                save(KEYS.USER_MAP, userEnabledMap);
                renderUserList();
            }
            input.value = '';
        });
        bindClick('poop-save', function() {
            var tokenInput = document.getElementById('poop-token');
            var guildInput = document.getElementById('poop-guild');
            var delayInput = document.getElementById('poop-delay');
            if (tokenInput) { manualToken = tokenInput.value.trim(); save(KEYS.TOKEN, manualToken); }
            if (guildInput) { manualGuildId = guildInput.value.trim(); save(KEYS.GUILD_ID, manualGuildId); }
            if (delayInput) { userDelayMs = Number(delayInput.value) || 800; save(KEYS.DELAY, String(userDelayMs)); }
            save(KEYS.TARGETS, targetUserIds);
            save(KEYS.EMOJIS, emojiList);
            save(KEYS.CHANNELS, manualChannelIds);
            showToast('已保存', 'success');
            togglePanel();
        });
        
        var tokenInput = document.getElementById('poop-token');
        var guildInput = document.getElementById('poop-guild');
        if (tokenInput) tokenInput.value = manualToken;
        if (guildInput) guildInput.value = manualGuildId;
    }

    function renderEmojiList() {
        var list = document.getElementById('poop-emoji-list');
        if (!list) return;
        var m = isMobile();
        var fragment = document.createDocumentFragment();
        for (var i = 0; i < emojiList.length; i++) {
            (function(item, idx) {
                var li = document.createElement('li');
                li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:' + (m ? '14px 12px' : '10px 12px') + ';border-bottom:1px solid #40444b;min-height:' + (m ? '60px' : 'auto') + ';';
                var left = document.createElement('div');
                left.style.cssText = 'display:flex;align-items:center;gap:10px;';
                var preview = document.createElement('span');
                if (item.type === 'unicode') {
                    preview.textContent = item.emoji;
                    preview.style.fontSize = '24px';
                } else {
                    var parts = item.emoji.split(':');
                    var ext = item.animated ? 'gif' : 'png';
                    preview.innerHTML = '<img src="https://cdn.discordapp.com/emojis/' + parts[1] + '.' + ext + '" style="width:28px;height:28px;" />';
                }
                var nameSpan = document.createElement('span');
                nameSpan.textContent = item.name;
                nameSpan.style.cssText = 'color:#b9bbbe;font-size:13px;';
                left.appendChild(preview);
                left.appendChild(nameSpan);
                var btns = document.createElement('div');
                btns.style.cssText = 'display:flex;gap:8px;flex-shrink:0;';
                var en = isEmojiEnabled(item.emoji);
                var toggle = document.createElement('button');
                toggle.textContent = en ? '启用' : '禁用';
                toggle.style.cssText = 'padding:' + (m ? '8px 14px' : '6px 12px') + ';background:' + (en ? '#57F287' : '#4f545c') + ';border:none;border-radius:4px;color:' + (en ? '#16181a' : '#fff') + ';cursor:pointer;font-size:' + (m ? '14px' : '12px') + ';min-width:' + (m ? '60px' : '50px') + ';min-height:' + (m ? '40px' : 'auto') + ';';
                toggle.onclick = function(e) {
                    e.preventDefault();
                    emojiEnabledMap[item.emoji] = !isEmojiEnabled(item.emoji);
                    save(KEYS.EMOJI_MAP, emojiEnabledMap);
                    renderEmojiList();
                };
                var del = document.createElement('button');
                del.textContent = '删除';
                del.style.cssText = 'padding:' + (m ? '8px 14px' : '6px 12px') + ';background:#ED4245;border:none;border-radius:4px;color:#fff;cursor:pointer;font-size:' + (m ? '14px' : '12px') + ';min-width:' + (m ? '60px' : '50px') + ';min-height:' + (m ? '40px' : 'auto') + ';';
                del.onclick = function(e) {
                    e.preventDefault();
                    emojiList.splice(idx, 1);
                    delete emojiEnabledMap[item.emoji];
                    save(KEYS.EMOJIS, emojiList);
                    save(KEYS.EMOJI_MAP, emojiEnabledMap);
                    renderEmojiList();
                };
                btns.appendChild(toggle);
                btns.appendChild(del);
                li.appendChild(left);
                li.appendChild(btns);
                fragment.appendChild(li);
            })(emojiList[i], i);
        }
        list.innerHTML = '';
        list.appendChild(fragment);
    }

    function renderChannelList() {
        var list = document.getElementById('poop-channel-list');
        if (!list) return;
        var m = isMobile();
        var fragment = document.createDocumentFragment();
        for (var i = 0; i < manualChannelIds.length; i++) {
            (function(id, idx) {
                var li = document.createElement('li');
                li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:' + (m ? '12px 10px' : '8px 10px') + ';border-bottom:1px solid #40444b;min-height:' + (m ? '56px' : 'auto') + ';';
                var span = document.createElement('span');
                span.textContent = id;
                span.style.cssText = 'font-size:' + (m ? '14px' : '13px') + ';word-break:break-all;';
                var btns = document.createElement('div');
                btns.style.cssText = 'display:flex;gap:8px;flex-shrink:0;';
                var en = isChannelEnabled(id);
                var toggle = document.createElement('button');
                toggle.textContent = en ? '启用' : '禁用';
                toggle.style.cssText = 'padding:' + (m ? '8px 12px' : '4px 10px') + ';background:' + (en ? '#57F287' : '#4f545c') + ';border:none;border-radius:4px;color:' + (en ? '#16181a' : '#fff') + ';cursor:pointer;font-size:' + (m ? '14px' : '12px') + ';min-width:' + (m ? '60px' : '50px') + ';min-height:' + (m ? '40px' : 'auto') + ';';
                toggle.onclick = function(e) { e.preventDefault(); channelEnabledMap[id] = !isChannelEnabled(id); save(KEYS.CHANNEL_MAP, channelEnabledMap); renderChannelList(); };
                var del = document.createElement('button');
                del.textContent = '删除';
                del.style.cssText = 'padding:' + (m ? '8px 12px' : '4px 10px') + ';background:#ED4245;border:none;border-radius:4px;color:#fff;cursor:pointer;font-size:' + (m ? '14px' : '12px') + ';min-width:' + (m ? '60px' : '50px') + ';min-height:' + (m ? '40px' : 'auto') + ';';
                del.onclick = function(e) { e.preventDefault(); manualChannelIds.splice(idx, 1); delete channelEnabledMap[id]; save(KEYS.CHANNELS, manualChannelIds); save(KEYS.CHANNEL_MAP, channelEnabledMap); renderChannelList(); };
                btns.appendChild(toggle);
                btns.appendChild(del);
                li.appendChild(span);
                li.appendChild(btns);
                fragment.appendChild(li);
            })(manualChannelIds[i], i);
        }
        list.innerHTML = '';
        list.appendChild(fragment);
    }

    function renderUserList() {
        var list = document.getElementById('poop-user-list');
        if (!list) return;
        var m = isMobile();
        var fragment = document.createDocumentFragment();
        for (var i = 0; i < targetUserIds.length; i++) {
            (function(id, idx) {
                var li = document.createElement('li');
                li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:' + (m ? '12px 10px' : '8px 10px') + ';border-bottom:1px solid #40444b;min-height:' + (m ? '56px' : 'auto') + ';';
                var span = document.createElement('span');
                span.textContent = id;
                span.style.cssText = 'font-size:' + (m ? '14px' : '13px') + ';word-break:break-all;';
                var btns = document.createElement('div');
                btns.style.cssText = 'display:flex;gap:8px;flex-shrink:0;';
                var en = isUserEnabled(id);
                var toggle = document.createElement('button');
                toggle.textContent = en ? '启用' : '禁用';
                toggle.style.cssText = 'padding:' + (m ? '8px 12px' : '4px 10px') + ';background:' + (en ? '#57F287' : '#4f545c') + ';border:none;border-radius:4px;color:' + (en ? '#16181a' : '#fff') + ';cursor:pointer;font-size:' + (m ? '14px' : '12px') + ';min-width:' + (m ? '60px' : '50px') + ';min-height:' + (m ? '40px' : 'auto') + ';';
                toggle.onclick = function(e) { e.preventDefault(); userEnabledMap[id] = !isUserEnabled(id); save(KEYS.USER_MAP, userEnabledMap); renderUserList(); };
                var del = document.createElement('button');
                del.textContent = '删除';
                del.style.cssText = 'padding:' + (m ? '8px 12px' : '4px 10px') + ';background:#ED4245;border:none;border-radius:4px;color:#fff;cursor:pointer;font-size:' + (m ? '14px' : '12px') + ';min-width:' + (m ? '60px' : '50px') + ';min-height:' + (m ? '40px' : 'auto') + ';';
                del.onclick = function(e) { e.preventDefault(); targetUserIds.splice(idx, 1); delete userEnabledMap[id]; save(KEYS.TARGETS, targetUserIds); save(KEYS.USER_MAP, userEnabledMap); renderUserList(); };
                btns.appendChild(toggle);
                btns.appendChild(del);
                li.appendChild(span);
                li.appendChild(btns);
                fragment.appendChild(li);
            })(targetUserIds[i], i);
        }
        list.innerHTML = '';
        list.appendChild(fragment);
    }

    function init() {
        console.log('[Discord Auto Reaction] 脚本初始化');
        authToken = readToken();
        if (!authToken) {
            console.log('[Discord Auto Reaction] 未找到Token,注入桥接');
            injectTokenBridge();
        } else {
            console.log('[Discord Auto Reaction] Token已获取');
        }
        
        if (document.body) {
            buildFab();
            console.log('[Discord Auto Reaction] FAB已创建');
            if (isEnabled) {
                console.log('[Discord Auto Reaction] 自动启动,服务器ID:', manualGuildId || '未填写');
                if (manualGuildId) startPolling();
                else startObserver();
            }
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                authToken = readToken();
                if (!authToken) injectTokenBridge();
                buildFab();
                if (isEnabled) {
                    if (manualGuildId) startPolling();
                    else startObserver();
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    console.log('[Discord Auto Reaction] 脚本已加载,版本 1.0 - by FFFLORRA');
})();