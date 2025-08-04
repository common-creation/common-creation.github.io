const params = new URLSearchParams(location.search);

const toHex = (val) => val.toString(16).padStart(2, "0").toUpperCase();
const strToHexStream = (str) => str.split("").map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").toUpperCase();
const hexToAscii = (hex) => {
  let ascii = "";
  for (let i = 0; i < hex.length; i += 2) {
    const byte = hex.substr(i, 2);
    ascii += String.fromCharCode(parseInt(byte, 16));
  }
  return ascii;
};
const numToHex = (num, byteLength) => {
  const hexValue = parseInt(num).toString(16).toUpperCase();
  const targetLength = byteLength * 2; // バイト数を文字数に変換
  return hexValue.padStart(targetLength, "0");
};
const hexToNum = (hex) => {
  return parseInt(hex, 16).toString();
};
// expose to devtool
window.toHex = toHex;
window.strToHexStream = strToHexStream;
window.hexToAscii = hexToAscii;
window.numToHex = numToHex;
window.hexToNum = hexToNum;

const copyToClipboard = (text) => {
  const p = document.createElement("p");
  p.style.opacity = "0";
  p.style.position = "absolute";
  p.style.top = "0";
  p.style.left = "0";
  document.body.appendChild(p);
  p.innerHTML = text;

  let result;
  try {
    const range = document.createRange();
    range.selectNode(p);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    result = document.execCommand("copy");
    window.getSelection().removeAllRanges();
  } finally {
    document.body.removeChild(p);
  }
  return result;
}

const App = (props) => {
  const [priority, setPriority] = React.useState(255);
  const [timer, setTimer] = React.useState(1);
  const [channel, setChannel] = React.useState(2);
  const [menuCount, setMenuCount] = React.useState(1);
  const [entryLabelLength, setEntryLabelLength] = React.useState(20);
  const [useUiccFs, setUseUiccFs] = React.useState((params.get("useuiccfs") == null) || (params.get("useuiccfs") === "true") || false);
  const [adf1Aid, setAdf1Aid] = React.useState(params.get("adf1aid") || "A0000000871002FFFFFFFF8903020000");

  const [generatedUssp, setGeneratedUssp] = React.useState("");
  const [generatedUsspWithTag, setGeneratedUsspWithTag] = React.useState("");

  const [ramQuota, setRAMQuota] = React.useState(1);
  const [nvramQuota, setNVRAMQuota] = React.useState(1);

  const [generatedSspWithTag, setGeneratedSspWithTag] = React.useState("");

  const [aspTags, setAspTags] = React.useState([{ id: 1, tag: "", payload: "", payloadMode: "hex", numericLength: 2 }]);
  const [nextTagId, setNextTagId] = React.useState(2);

  const [generatedAsp, setGeneratedAsp] = React.useState("");
  const [generatedAspWithTag, setGeneratedAspWithTag] = React.useState("");

  // JSON エクスポート機能
  const exportConfig = () => {
    const config = {
      priority,
      timer,
      channel,
      menuCount,
      entryLabelLength,
      useUiccFs,
      adf1Aid,
      ramQuota,
      nvramQuota,
      aspTags: aspTags.map(({tag, payload, payloadMode, numericLength}) => ({tag, payload, payloadMode, numericLength}))
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uicc-config-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // JSON インポート機能
  const importConfig = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target.result);
        
        // 設定値の反映
        if (config.priority !== undefined) setPriority(config.priority);
        if (config.timer !== undefined) setTimer(config.timer);
        if (config.channel !== undefined) setChannel(config.channel);
        if (config.menuCount !== undefined) setMenuCount(config.menuCount);
        if (config.entryLabelLength !== undefined) setEntryLabelLength(config.entryLabelLength);
        if (config.useUiccFs !== undefined) setUseUiccFs(config.useUiccFs);
        if (config.adf1Aid !== undefined) setAdf1Aid(config.adf1Aid);
        if (config.ramQuota !== undefined) setRAMQuota(config.ramQuota);
        if (config.nvramQuota !== undefined) setNVRAMQuota(config.nvramQuota);
        
        // ASPタグの反映
        if (config.aspTags && Array.isArray(config.aspTags)) {
          const newTags = config.aspTags.map((tag, index) => ({
            id: index + 1,
            tag: tag.tag || "",
            payload: tag.payload || "",
            payloadMode: tag.payloadMode || "hex",
            numericLength: tag.numericLength || 2
          }));
          setAspTags(newTags.length > 0 ? newTags : [{ id: 1, tag: "", payload: "", payloadMode: "hex", numericLength: 2 }]);
          setNextTagId(newTags.length + 1);
        }
      } catch (error) {
        alert('JSONファイルの読み込みに失敗しました。正しい形式のファイルを選択してください。');
      }
    };
    reader.readAsText(file);
    
    // ファイル選択をリセット
    event.target.value = '';
  };

  const generateSsp = () => {
    let ssp = "";
    ssp += "C702" + ramQuota.toString(16).padStart(4,"0")
    ssp += "C802" + nvramQuota.toString(16).padStart(4,"0")
    ssp = "EF" + toHex(ssp.length/2) + ssp;
    ssp = ssp.toUpperCase();

    setGeneratedSspWithTag(ssp);
  }

  const generateAsp = () => {
    let asp = "";
    
    // 各タグを処理
    aspTags.forEach(({tag, payload, payloadMode, numericLength}) => {
      if (tag) {
        const tagHex = tag.toUpperCase();
        if (payload) {
          // モードに応じて変換
          let payloadHex;
          if (payloadMode === 'ascii') {
            payloadHex = strToHexStream(payload).toUpperCase();
          } else if (payloadMode === 'numeric') {
            payloadHex = numToHex(payload, numericLength).toUpperCase();
          } else {
            payloadHex = payload.toUpperCase();
          }
          const ll = toHex(payloadHex.length / 2);
          asp += tagHex + ll + payloadHex;
        } else {
          // タグは指定されているがペイロードがない場合
          asp += tagHex + "00";
        }
      }
    });
    
    asp = asp.toUpperCase();
    setGeneratedAsp(asp);

    const nn = toHex(asp.length / 2);
    const aspWithTag = "C9" + nn + asp;
    setGeneratedAspWithTag(aspWithTag);
  }
  
  const addTag = () => {
    setAspTags([...aspTags, { id: nextTagId, tag: "", payload: "", payloadMode: "hex", numericLength: 2 }]);
    setNextTagId(nextTagId + 1);
  }
  
  const removeTag = (id) => {
    setAspTags(aspTags.filter(t => t.id !== id));
  }
  
  const updateTag = (id, field, value) => {
    setAspTags(aspTags.map(t => 
      t.id === id ? { ...t, [field]: value } : t
    ));
  }

  const generateUssp = () => {
    let ussp = "";

    ussp += "80"; // Tag of **UICC Toolkit** Application specific parameters field

    let utasp = "";
    utasp += toHex(priority); // Priority level of the Toolkit application instance
    utasp += toHex(timer); // Maximum number of timers allowed for this application instance
    utasp += toHex(entryLabelLength); // Maximum text length for a menu entry
    utasp += toHex(menuCount); // Maximum number of menu entries allowed for this application instance
    for (let i = 0; i < menuCount; i++) {
      utasp += toHex(i+1); // Position of the n-th menu entry
      utasp += "00"; // Identifier of the n-th menu entry ('00' means do not care)
    }
    utasp += toHex(channel); // Maximum number of channels for this application instance
    utasp += "00"; // Length of Minimum Security Level field

    ussp += toHex(utasp.length / 2); // Length of UICC Toolkit Application specific parameters field
    ussp += utasp;

    if (useUiccFs) {
      ussp += "81"; // Tag of **UICC Access** Application specific parameters field

      let uiccFs = "";
      uiccFs += "00"; // Length of UICC file system AID
      uiccFs += "01"; // Length of Access Domain for UICC file system
      uiccFs += "00"; // Access Domain for UICC file system
      uiccFs += "00"; // Length of Access Domain DAP
      uiccFs += toHex(adf1Aid.length / 2); // Length of ADF#1 AID
      uiccFs += adf1Aid;
      uiccFs += "01"; // Length of Access Domain for ADF#1
      uiccFs += "00"; // Access Domain for ADF#1
      uiccFs += "00"; // Length of Access Domain DAP#1

      ussp += toHex(uiccFs.length / 2); // Length of UICC Access Application specific parameters field
      ussp += uiccFs;
    }
    ussp = ussp.toUpperCase();

    setGeneratedUssp(ussp);

    let usspWithTag = "EA" + toHex(ussp.length/2) + ussp;
    setGeneratedUsspWithTag(usspWithTag);

  }

  React.useEffect(() => {
    generateUssp();
    generateSsp();
    generateAsp();
  }, [priority, timer, channel, menuCount, entryLabelLength, useUiccFs, adf1Aid,
      ramQuota, nvramQuota,
      aspTags]);

  const gpParams = generatedAspWithTag + generatedSspWithTag + generatedUsspWithTag;

  return React.createElement('div', { className: 'container mx-auto p-6 max-w-5xl' },
    React.createElement('div', { className: 'flex justify-between items-center mb-8' },
      React.createElement('h1', { className: 'text-3xl font-bold text-gray-900 dark:text-white' }, 
        'UICC system specific parameters generator'
      ),
      React.createElement('div', { className: 'flex gap-2' },
        React.createElement('input', {
          type: 'file',
          accept: '.json',
          onChange: importConfig,
          className: 'hidden',
          id: 'import-config'
        }),
        React.createElement('label', {
          htmlFor: 'import-config',
          className: 'text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 cursor-pointer dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800'
        }, 'インポート'),
        React.createElement('button', {
          type: 'button',
          className: 'text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-green-600 dark:hover:bg-green-700 focus:outline-none dark:focus:ring-green-800',
          onClick: exportConfig
        }, 'エクスポート')
      )
    ),

    // 基本設定
    React.createElement('div', { className: 'bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6' },
      React.createElement('h2', { className: 'text-xl font-semibold text-gray-900 dark:text-white mb-4' }, '設定'),
      React.createElement('div', { className: 'grid gap-6 md:grid-cols-2' },
        React.createElement('div', null,
          React.createElement('label', { className: 'block mb-2 text-sm font-medium text-gray-900 dark:text-white' }, 
            'Toolkit アプリケーション インスタンスの優先度'
          ),
          React.createElement('input', {
            type: 'number',
            className: 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500',
            value: priority,
            onChange: (e) => setPriority(parseInt(e.target.value, 10)),
            min: 0,
            max: 255
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'block mb-2 text-sm font-medium text-gray-900 dark:text-white' }, 
            'タイマーの数'
          ),
          React.createElement('input', {
            type: 'number',
            className: 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500',
            value: timer,
            onChange: (e) => setTimer(parseInt(e.target.value, 10)),
            min: 0,
            max: 255
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'block mb-2 text-sm font-medium text-gray-900 dark:text-white' }, 
            'チャネルの数'
          ),
          React.createElement('input', {
            type: 'number',
            className: 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500',
            value: channel,
            onChange: (e) => setChannel(parseInt(e.target.value, 10)),
            min: 0,
            max: 255
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'block mb-2 text-sm font-medium text-gray-900 dark:text-white' }, 
            'メニューに表示するエントリーの数'
          ),
          React.createElement('input', {
            type: 'number',
            className: 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500',
            value: menuCount,
            onChange: (e) => setMenuCount(parseInt(e.target.value, 10)),
            min: 0,
            max: 255
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'block mb-2 text-sm font-medium text-gray-900 dark:text-white' }, 
            'メニュー エントリーの文字数'
          ),
          React.createElement('input', {
            type: 'number',
            className: 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500',
            value: entryLabelLength,
            onChange: (e) => setEntryLabelLength(parseInt(e.target.value, 10)),
            min: 0,
            max: 255
          })
        )
      ),
      React.createElement('div', { className: 'flex items-center mt-4' },
        React.createElement('input', {
          type: 'checkbox',
          className: 'w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600',
          checked: useUiccFs,
          onChange: (e) => setUseUiccFs(e.target.checked)
        }),
        React.createElement('label', { className: 'ml-2 text-sm font-medium text-gray-900 dark:text-gray-300' },
          'UICC AIDファイルシステムを使用する'
        )
      ),
      useUiccFs && React.createElement('div', { className: 'mt-4' },
        React.createElement('label', { className: 'block mb-2 text-sm font-medium text-gray-900 dark:text-white' }, 
          'ADF#1 AID (hex)'
        ),
        React.createElement('input', {
          type: 'text',
          className: 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500',
          value: adf1Aid,
          onChange: (e) => {
            const value = e.target.value.toUpperCase();
            if (/^[0-9A-F]*$/.test(value)) {
              setAdf1Aid(value);
            }
          },
          placeholder: '16進数のみ (0-9, A-F)'
        })
      )
    ),

    // System Specific Parameters
    React.createElement('div', { className: 'bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6' },
      React.createElement('h2', { className: 'text-xl font-semibold text-gray-900 dark:text-white mb-4' }, 
        '設定(System Specific Parameters)'
      ),
      React.createElement('div', { className: 'grid gap-6 md:grid-cols-2' },
        React.createElement('div', null,
          React.createElement('label', { className: 'block mb-2 text-sm font-medium text-gray-900 dark:text-white' }, 
            'Volatile Memory Quota(C7)'
          ),
          React.createElement('input', {
            type: 'number',
            className: 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500',
            value: ramQuota,
            onChange: (e) => setRAMQuota(parseInt(e.target.value, 10)),
            min: 0,
            max: 65535
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'block mb-2 text-sm font-medium text-gray-900 dark:text-white' }, 
            'Non-volatile Memory Quota(C8)'
          ),
          React.createElement('input', {
            type: 'number',
            className: 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500',
            value: nvramQuota,
            onChange: (e) => setNVRAMQuota(parseInt(e.target.value, 10)),
            min: 0,
            max: 65535
          })
        )
      )
    ),

    // Application Specific Parameters
    React.createElement('div', { className: 'bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6' },
      React.createElement('h2', { className: 'text-xl font-semibold text-gray-900 dark:text-white mb-2' }, 
        '設定(Application Specific Parameters)'
      ),
      React.createElement('p', { className: 'text-sm text-gray-600 dark:text-gray-400 mb-4' }, 
        'C9NNTTLLXXXXXXの形式で設定'
      ),
      aspTags.map((tagItem, index) =>
        React.createElement('div', { 
          key: tagItem.id, 
          className: 'bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4'
        },
          React.createElement('div', { className: 'flex justify-between items-center mb-4' },
            React.createElement('h4', { className: 'text-lg font-medium text-gray-900 dark:text-white' }, 
              `タグ ${index + 1}`
            ),
            aspTags.length > 1 && React.createElement('button', {
              type: 'button',
              className: 'text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-3 py-1.5 dark:bg-red-600 dark:hover:bg-red-700 focus:outline-none dark:focus:ring-red-800',
              onClick: () => removeTag(tagItem.id)
            }, '- 削除')
          ),
          React.createElement('div', { className: 'grid gap-4 md:grid-cols-2' },
            React.createElement('div', null,
              React.createElement('label', { className: 'block mb-2 text-sm font-medium text-gray-900 dark:text-white' }, 
                'TT (タグ番号 hex)'
              ),
              React.createElement('input', {
                type: 'text',
                className: 'bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white',
                value: tagItem.tag,
                onChange: (e) => {
                  const value = e.target.value.toUpperCase();
                  if (/^[0-9A-F]{0,2}$/.test(value)) {
                    updateTag(tagItem.id, 'tag', value);
                  }
                },
                placeholder: '例: 80',
                maxLength: 2
              })
            ),
            React.createElement('div', null,
              React.createElement('div', { className: 'flex items-center justify-between mb-2' },
                React.createElement('label', { className: 'text-sm font-medium text-gray-900 dark:text-white' }, 
                  'ペイロード'
                ),
                React.createElement('div', { className: 'flex items-center space-x-4' },
                  React.createElement('label', { className: 'flex items-center' },
                    React.createElement('input', {
                      type: 'radio',
                      name: `payloadMode-${tagItem.id}`,
                      value: 'hex',
                      checked: tagItem.payloadMode === 'hex',
                      onChange: () => {
                        // 現在asciiモードの場合、hexに変換
                        if (tagItem.payloadMode === 'ascii' && tagItem.payload) {
                          const hexPayload = strToHexStream(tagItem.payload);
                          setAspTags(aspTags.map(t => 
                            t.id === tagItem.id ? { ...t, payloadMode: 'hex', payload: hexPayload } : t
                          ));
                        } else if (tagItem.payloadMode === 'numeric' && tagItem.payload) {
                          // numericモードの場合、numToHexで変換
                          const hexPayload = numToHex(tagItem.payload, tagItem.numericLength);
                          setAspTags(aspTags.map(t => 
                            t.id === tagItem.id ? { ...t, payloadMode: 'hex', payload: hexPayload } : t
                          ));
                        } else {
                          updateTag(tagItem.id, 'payloadMode', 'hex');
                        }
                      },
                      className: 'w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600'
                    }),
                    React.createElement('span', { className: 'ml-2 text-sm text-gray-900 dark:text-gray-300' }, 'hex')
                  ),
                  React.createElement('label', { className: 'flex items-center' },
                    React.createElement('input', {
                      type: 'radio',
                      name: `payloadMode-${tagItem.id}`,
                      value: 'ascii',
                      checked: tagItem.payloadMode === 'ascii',
                      onChange: () => {
                        // 現在hexモードの場合、asciiに変換（有効なhex文字列の場合のみ）
                        if (tagItem.payloadMode === 'hex' && tagItem.payload && tagItem.payload.length % 2 === 0) {
                          try {
                            const ascii = hexToAscii(tagItem.payload);
                            setAspTags(aspTags.map(t => 
                              t.id === tagItem.id ? { ...t, payloadMode: 'ascii', payload: ascii } : t
                            ));
                          } catch (e) {
                            // 変換できない場合はモードだけ変更
                            updateTag(tagItem.id, 'payloadMode', 'ascii');
                          }
                        } else if (tagItem.payloadMode === 'numeric') {
                          // numeric→asciiは直接変換せず、ペイロードをクリア
                          setAspTags(aspTags.map(t => 
                            t.id === tagItem.id ? { ...t, payloadMode: 'ascii', payload: '' } : t
                          ));
                        } else {
                          updateTag(tagItem.id, 'payloadMode', 'ascii');
                        }
                      },
                      className: 'w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600'
                    }),
                    React.createElement('span', { className: 'ml-2 text-sm text-gray-900 dark:text-gray-300' }, 'ascii')
                  ),
                  React.createElement('label', { className: 'flex items-center' },
                    React.createElement('input', {
                      type: 'radio',
                      name: `payloadMode-${tagItem.id}`,
                      value: 'numeric',
                      checked: tagItem.payloadMode === 'numeric',
                      onChange: () => {
                        // 現在hexモードの場合、numericに変換
                        if (tagItem.payloadMode === 'hex' && tagItem.payload) {
                          try {
                            const num = hexToNum(tagItem.payload);
                            setAspTags(aspTags.map(t => 
                              t.id === tagItem.id ? { ...t, payloadMode: 'numeric', payload: num } : t
                            ));
                          } catch (e) {
                            // 変換できない場合はモードだけ変更
                            updateTag(tagItem.id, 'payloadMode', 'numeric');
                          }
                        } else {
                          // ascii→numericは直接変換せず、ペイロードをクリア
                          setAspTags(aspTags.map(t => 
                            t.id === tagItem.id ? { ...t, payloadMode: 'numeric', payload: '' } : t
                          ));
                        }
                      },
                      className: 'w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600'
                    }),
                    React.createElement('span', { className: 'ml-2 text-sm text-gray-900 dark:text-gray-300' }, 'numeric')
                  )
                )
              ),
              React.createElement('input', {
                type: 'text',
                className: 'bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white',
                value: tagItem.payload,
                onChange: (e) => {
                  if (tagItem.payloadMode === 'hex') {
                    const value = e.target.value.toUpperCase();
                    if (/^[0-9A-F]*$/.test(value)) {
                      updateTag(tagItem.id, 'payload', value);
                    }
                  } else if (tagItem.payloadMode === 'numeric') {
                    // numericモードは数字のみ、最大値チェック
                    const value = e.target.value;
                    if (/^[0-9]*$/.test(value)) {
                      const numValue = parseInt(value || '0', 10);
                      const maxValue = Math.pow(256, tagItem.numericLength) - 1;
                      if (numValue <= maxValue) {
                        updateTag(tagItem.id, 'payload', value);
                      }
                    }
                  } else {
                    // asciiモードは制限なし
                    updateTag(tagItem.id, 'payload', e.target.value);
                  }
                },
                placeholder: tagItem.payloadMode === 'hex' ? '例: 0123456789ABCDEF' : tagItem.payloadMode === 'ascii' ? '例: Hello World' : '例: 8000'
              })
            ),
            tagItem.payloadMode === 'numeric' && React.createElement('div', { className: 'mt-2' },
              React.createElement('label', { className: 'block mb-1 text-xs font-medium text-gray-900 dark:text-white' }, 
                '長さ (バイト)'
              ),
              React.createElement('input', {
                type: 'number',
                className: 'bg-white border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-20 p-1.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white',
                value: tagItem.numericLength,
                onChange: (e) => {
                  const value = parseInt(e.target.value, 10);
                  if (value > 0 && value <= 8) { // 最大8バイト
                    updateTag(tagItem.id, 'numericLength', value);
                  }
                },
                min: 1,
                max: 8,
                placeholder: '2'
              })
            )
          ),
          tagItem.tag && tagItem.payload && React.createElement('div', { className: 'mt-2' },
            React.createElement('span', { 
              className: 'bg-blue-100 text-blue-800 text-xs font-medium mr-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300' 
            }, `LL (長さ): ${(() => {
              let hexPayload;
              if (tagItem.payloadMode === 'ascii') {
                hexPayload = strToHexStream(tagItem.payload);
              } else if (tagItem.payloadMode === 'numeric') {
                hexPayload = numToHex(tagItem.payload || '0', tagItem.numericLength);
              } else {
                hexPayload = tagItem.payload;
              }
              return toHex(hexPayload.length / 2);
            })()}`)
          )
        )
      ),
      React.createElement('div', { className: 'flex justify-end mt-2' },
        React.createElement('button', {
          type: 'button',
          className: 'text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800',
          onClick: addTag
        }, '+ タグを追加')
      )
    ),

    // UICC_SYSTEM_SPECIFIC_PARAMETERS
    React.createElement('div', { className: 'bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6' },
      React.createElement('h2', { className: 'text-xl font-semibold text-gray-900 dark:text-white mb-4' }, 
        'UICC_SYSTEM_SPECIFIC_PARAMETERS'
      ),
      React.createElement('div', { className: 'p-4 bg-gray-100 dark:bg-gray-700 rounded-lg' },
        React.createElement('code', { className: 'text-sm text-gray-900 dark:text-white break-all' }, generatedUssp)
      ),
      React.createElement('div', { className: 'flex justify-end mt-3' },
        React.createElement('button', {
          type: 'button',
          className: 'text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-green-600 dark:hover:bg-green-700 focus:outline-none dark:focus:ring-green-800',
          onClick: () => copyToClipboard(generatedUssp)
        }, 'クリップボードにコピー')
      )
    ),

    // APP_SPECIFIC_PARAMETERS
    React.createElement('div', { className: 'bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6' },
      React.createElement('h2', { className: 'text-xl font-semibold text-gray-900 dark:text-white mb-4' }, 
        'APP_SPECIFIC_PARAMETERS (STORE DATA)'
      ),
      React.createElement('div', { className: 'p-4 bg-gray-100 dark:bg-gray-700 rounded-lg' },
        React.createElement('code', { className: 'text-sm text-gray-900 dark:text-white break-all' }, generatedAsp)
      ),
      generatedAsp && React.createElement('div', { className: 'mt-2' },
        React.createElement('span', { 
          className: 'bg-gray-100 text-gray-800 text-xs font-medium mr-2 px-2.5 py-0.5 rounded dark:bg-gray-700 dark:text-gray-300' 
        }, `NN (全体の長さ): ${toHex(generatedAsp.length / 2)}`)
      ),
      React.createElement('div', { className: 'flex justify-end mt-3' },
        React.createElement('button', {
          type: 'button',
          className: 'text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-green-600 dark:hover:bg-green-700 focus:outline-none dark:focus:ring-green-800',
          onClick: () => copyToClipboard(generatedAsp)
        }, 'クリップボードにコピー')
      )
    ),

    // GlobalPlatformPro
    React.createElement('div', { className: 'bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6' },
      React.createElement('h2', { className: 'text-xl font-semibold text-gray-900 dark:text-white mb-4' }, 
        '--params for GlobalPlatformPro (C9)'
      ),
      React.createElement('div', { className: 'p-4 bg-gray-100 dark:bg-gray-700 rounded-lg' },
        React.createElement('code', { className: 'text-sm text-gray-900 dark:text-white break-all' }, gpParams)
      ),
      React.createElement('div', { className: 'flex justify-between items-center mt-3' },
        React.createElement('span', { 
          className: gpParams.length > 255 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-400'
        }, `${gpParams.length}/255`),
        React.createElement('button', {
          type: 'button',
          className: gpParams.length > 255 
            ? 'text-white bg-gray-400 cursor-not-allowed font-medium rounded-lg text-sm px-5 py-2.5'
            : 'text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-green-600 dark:hover:bg-green-700 focus:outline-none dark:focus:ring-green-800',
          onClick: () => copyToClipboard(gpParams),
          disabled: gpParams.length > 255
        }, 'クリップボードにコピー')
      )
    )
  );
};

ReactDOM.createRoot(document.querySelector("#app")).render(React.createElement(App));