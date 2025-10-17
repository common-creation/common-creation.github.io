class AsciiDrawer {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.asciiContent = document.getElementById('ascii-content');
        this.coordsDisplay = document.getElementById('coords');
        this.loadingSpinner = document.getElementById('loading-spinner');
        this.currentTool = 'select';
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;

        this.asciiElements = [];
        this.selectedElement = null;
        this.clipboard = null;

        this.charWidth = 8; // 文字幅（ピクセル）
        this.charHeight = 14; // 文字高さ（ピクセル）

        // リサイズ関連
        this.isResizing = false;
        this.resizeHandle = null;
        this.resizeStartX = 0;
        this.resizeStartY = 0;
        this.resizeStartWidth = 0;
        this.resizeStartHeight = 0;
        this.resizeHandles = [];

        // 移動関連
        this.isDragging = false;
        this.dragThreshold = 1; // ドラッグと判定するピクセル数
        this.hasDragStarted = false; // ドラッグが開始したか

        this.init();
    }

    init() {
        document.fonts.ready.then(() => {
            this.setupEventListeners();
            this.setupToolbarEvents();
            this.setupKeyboardEvents();
            this.updateCanvasSize();

            // フォント読み込み完了後にローディングスピナーを非表示
            this.loadingSpinner.classList.add('hidden');
        });
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('click', this.handleClick.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));

        // リサイズハンドルのイベントをキャンバスに委譲
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('resize-handle')) {
                const handleType = e.target.dataset.handleType;
                this.handleResizeMouseDown(e, handleType);
            }
        });

        // ウィンドウリサイズ
        window.addEventListener('resize', () => {
            this.updateCanvasSize();
        });
    }

    setupToolbarEvents() {
        // ツールボタン
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
                this.updateCursor();
                this.clearSelection();
            });
        });

        // 編集ボタン
        document.getElementById('copy-btn').addEventListener('click', () => this.copySelected());
        document.getElementById('paste-btn').addEventListener('click', () => this.paste());
        document.getElementById('delete-btn').addEventListener('click', () => this.deleteSelected());

        // インポート・エクスポートボタン
        document.getElementById('export-btn').addEventListener('click', () => this.exportToFile());
        document.getElementById('import-btn').addEventListener('click', () => this.importFromFile());
        document.getElementById('copy-all-btn').addEventListener('click', () => this.copyAllToClipboard());
    }

    setupKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            // テキスト入力中はグローバルショートカットを無視
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
                return;
            }

            if (e.ctrlKey || e.metaKey) {
                switch(e.key.toLowerCase()) {
                    case 'c':
                        e.preventDefault();
                        this.copySelected();
                        break;
                    case 'v':
                        e.preventDefault();
                        this.paste();
                        break;
                    case 'a':
                        e.preventDefault();
                        this.selectAll();
                        break;
                }
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                this.deleteSelected();
            } else if (e.key === 'Escape') {
                this.clearSelection();
            }
        });
    }

    updateCursor() {
        this.canvas.className = 'canvas';
        if (this.currentTool !== 'select') {
            this.canvas.classList.add(`${this.currentTool}-mode`);
        }
    }

    getGridPosition(x, y) {
        const rect = this.canvas.getBoundingClientRect();
        const scrollX = this.canvas.scrollLeft;
        const scrollY = this.canvas.scrollTop;

        const gridX = Math.floor((x - rect.left + scrollX) / this.charWidth);
        const gridY = Math.floor((y - rect.top + scrollY) / this.charHeight);

        return { x: gridX, y: gridY };
    }

    handleMouseDown(e) {
        // ASCII要素もクリック可能にする
        if (!e.target.classList.contains('ascii-element') &&
            e.target !== this.canvas &&
            e.target !== this.asciiContent) return;

        const pos = this.getGridPosition(e.clientX, e.clientY);
        console.debug('MouseDown - Raw:', { x: e.clientX, y: e.clientY }, 'Grid:', pos, 'Target:', e.target.className);
        this.isDrawing = true;
        this.startX = pos.x;
        this.startY = pos.y;

        if (this.currentTool === 'select') {
            this.handleSelection(e, pos);
        }
    }

    handleDoubleClick(e) {
        // 選択ツールでのダブルクリックのみ処理
        if (this.currentTool !== 'select') return;

        // テキスト要素のダブルクリックを検出
        const target = e.target;
        if (!target.classList.contains('ascii-element') || !target.classList.contains('text')) return;

        // UUIDで該当するテキスト要素を検索
        const clickedElement = this.findElementByTarget(target);
        if (clickedElement && clickedElement.type === 'text') {
            e.preventDefault();
            e.stopPropagation();
            this.editTextElement(clickedElement);
        }
    }

    handleMouseMove(e) {
        const pos = this.getGridPosition(e.clientX, e.clientY);
        this.coordsDisplay.textContent = `X: ${pos.x}, Y: ${pos.y}`;

        // リサイズ処理を優先
        if (this.isResizing) {
            this.handleResize(e);
            return;
        }

        if (!this.isDrawing) return;

        switch (this.currentTool) {
            case 'rectangle':
                this.drawRectanglePreview(pos);
                break;
            case 'line':
                this.drawLinePreview(pos);
                break;
            case 'select':
                this.handleDrag(e, pos);
                break;
        }
    }

    handleMouseUp(e) {
        // リサイズ終了処理
        if (this.isResizing) {
            this.isResizing = false;
            this.resizeHandle = null;
            this.isDrawing = false; // isDrawingもリセット
            return;
        }

        // 移動終了処理
        if (this.isDragging) {
            this.isDragging = false;
            this.isDrawing = false; // isDrawingもリセット
            // 移動完了後にリサイズハンドルを再表示
            if (this.selectedElement && this.selectedElement.type === 'rectangle') {
                this.showResizeHandles(this.selectedElement);
            }
            return;
        }

        if (!this.isDrawing) return;

        const pos = this.getGridPosition(e.clientX, e.clientY);

        switch (this.currentTool) {
            case 'rectangle':
                this.createRectangle(pos);
                break;
            case 'line':
                this.createLine(pos);
                break;
        }

        this.isDrawing = false;
        this.clearPreview();
    }

    handleClick(e) {
        if (this.currentTool === 'text') {
            const pos = this.getGridPosition(e.clientX, e.clientY);
            this.createText(pos);
        }
    }

    // 矩形ツール
    drawRectanglePreview(endPos) {
        this.clearPreview();

        const left = Math.min(this.startX, endPos.x);
        const top = Math.min(this.startY, endPos.y);
        const width = Math.abs(endPos.x - this.startX) + 1;
        const height = Math.abs(endPos.y - this.startY) + 1;

        const preview = document.createElement('div');
        preview.className = 'drag-preview';
        preview.style.left = `${left * this.charWidth}px`;
        preview.style.top = `${top * this.charHeight}px`;
        preview.style.width = `${width * this.charWidth}px`;
        preview.style.height = `${height * this.charHeight}px`;

        this.asciiContent.appendChild(preview);
    }

    createRectangle(endPos) {
        const left = Math.min(this.startX, endPos.x);
        const top = Math.min(this.startY, endPos.y);
        const width = Math.abs(endPos.x - this.startX) + 1;
        const height = Math.abs(endPos.y - this.startY) + 1;

        if (width < 2 || height < 2) return;

        const rectangle = this.createRectangleElement(left, top, width, height);
        this.asciiElements.push(rectangle);
        this.asciiContent.appendChild(rectangle.element);

        // 重なり順を調整（テキスト要素を最前面に）
        this.updateZIndex();

        // 作成後に自動選択
        this.selectElement(rectangle);
    }

    createRectangleElement(x, y, width, height, existingId = null) {
        const element = document.createElement('div');
        const id = existingId || crypto.randomUUID();
        element.className = 'ascii-element rectangle';
        element.style.position = 'absolute';
        element.style.left = `${x * this.charWidth}px`;
        element.style.top = `${y * this.charHeight}px`;
        element.dataset.uuid = id;

        // 罫線アートの矩形を生成
        let asciiText = '';
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                if (row === 0 && col === 0) {
                    asciiText += '┌';
                } else if (row === 0 && col === width - 1) {
                    asciiText += '┐';
                } else if (row === height - 1 && col === 0) {
                    asciiText += '└';
                } else if (row === height - 1 && col === width - 1) {
                    asciiText += '┘';
                } else if (row === 0 || row === height - 1) {
                    asciiText += '─';
                } else if (col === 0 || col === width - 1) {
                    asciiText += '│';
                } else {
                    asciiText += ' ';
                }
            }
            if (row < height - 1) asciiText += '\n';
        }

        element.textContent = asciiText;
        element.style.whiteSpace = 'pre';

        return {
            type: 'rectangle',
            element: element,
            id: id,
            x: x,
            y: y,
            width: width,
            height: height
        };
    }

    // 直線ツール
    drawLinePreview(endPos) {
        this.clearPreview();

        const linePoints = this.getLinePoints(this.startX, this.startY, endPos.x, endPos.y);

        linePoints.forEach(point => {
            const char = document.createElement('div');
            char.className = 'drag-preview';
            char.style.left = `${point.x * this.charWidth}px`;
            char.style.top = `${point.y * this.charHeight}px`;
            char.style.width = `${this.charWidth}px`;
            char.style.height = `${this.charHeight}px`;
            this.asciiContent.appendChild(char);
        });
    }

    createLine(endPos) {
        const linePoints = this.getLinePoints(this.startX, this.startY, endPos.x, endPos.y);

        if (linePoints.length < 2) return;

        const line = this.createLineElement(linePoints);
        this.asciiElements.push(line);
        this.asciiContent.appendChild(line.element);

        // 重なり順を調整（テキスト要素を最前面に）
        this.updateZIndex();

        // 作成後に自動選択
        this.selectElement(line);
    }

    getLinePoints(x0, y0, x1, y1) {
        const points = [];
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            points.push({ x: x0, y: y0 });

            if (x0 === x1 && y0 === y1) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }

        return points;
    }

    createLineElement(points, existingId = null) {
        const element = document.createElement('div');
        const id = existingId || crypto.randomUUID();
        element.className = 'ascii-element line';
        element.style.position = 'absolute';

        // 線のバウンディングボックスを計算
        const minX = Math.min(...points.map(p => p.x));
        const minY = Math.min(...points.map(p => p.y));
        const maxX = Math.max(...points.map(p => p.x));
        const maxY = Math.max(...points.map(p => p.y));

        element.style.left = `${minX * this.charWidth}px`;
        element.style.top = `${minY * this.charHeight}px`;
        element.dataset.uuid = id;

        // 罫線アートの線を生成
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        let asciiText = Array(height).fill(null).map(() => Array(width).fill(' '));

        // 各点について適切な罫線文字を配置
        points.forEach((point, index) => {
            const relX = point.x - minX;
            const relY = point.y - minY;
            if (relY >= 0 && relY < height && relX >= 0 && relX < width) {
                // 次の点と前の点を確認して罫線文字を決定
                let hasHorizontal = false;
                let hasVertical = false;

                if (index > 0) {
                    const prevPoint = points[index - 1];
                    if (prevPoint.y === point.y) hasHorizontal = true;
                    if (prevPoint.x === point.x) hasVertical = true;
                }
                if (index < points.length - 1) {
                    const nextPoint = points[index + 1];
                    if (nextPoint.y === point.y) hasHorizontal = true;
                    if (nextPoint.x === point.x) hasVertical = true;
                }

                if (hasHorizontal && hasVertical) {
                    asciiText[relY][relX] = '┼'; // 十字
                } else if (hasHorizontal) {
                    asciiText[relY][relX] = '─'; // 横線
                } else if (hasVertical) {
                    asciiText[relY][relX] = '│'; // 縦線
                } else {
                    asciiText[relY][relX] = '●'; // ドット（単独点）
                }
            }
        });

        element.textContent = asciiText.map(row => row.join('')).join('\n');
        element.style.whiteSpace = 'pre';

        return {
            type: 'line',
            element: element,
            id: id,
            points: points.map(p => ({ x: p.x - minX, y: p.y - minY })),
            x: minX,
            y: minY
        };
    }

    // テキストツール
    createText(pos) {
        const textarea = document.createElement('textarea');
        textarea.className = 'text-input-field';
        textarea.style.left = `${pos.x * this.charWidth}px`;
        textarea.style.top = `${pos.y * this.charHeight}px`;
        textarea.style.width = '200px'; // 適切な幅
        textarea.style.height = '40px'; // 適切な高さ
        textarea.style.resize = 'both'; // ユーザーがリサイズ可能

        this.asciiContent.appendChild(textarea);
        textarea.focus();

        const finishText = () => {
            const text = textarea.value.trim();
            if (text) {
                const textElement = this.createTextElement(pos.x, pos.y, text);
                this.asciiElements.push(textElement);
                this.asciiContent.appendChild(textElement.element);

                // 重なり順を調整（テキスト要素を最前面に）
                this.updateZIndex();

                // 作成後に自動選択
                this.selectElement(textElement);
            }
            textarea.remove();
        };

        // IME入力中の誤操作を防ぐため、keydownイベントをcompositionendで処理
        let isComposing = false;

        textarea.addEventListener('compositionstart', () => {
            isComposing = true;
        });

        textarea.addEventListener('compositionend', () => {
            isComposing = false;
        });

        textarea.addEventListener('blur', finishText);

        // キーボードイベント処理
        textarea.addEventListener('keydown', (e) => {
            // Escapeキーでキャンセル
            if (e.key === 'Escape') {
                e.preventDefault();
                textarea.remove();
                return;
            }

            // Ctrl+EnterまたはCmd+Enterで確定（オプション）
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                finishText();
                return;
            }

            // その他のキーはデフォルトの動作を許可（Backspace, Delete, Enter, Arrowキーなど）
        });

        // 自動で高さを調整する処理
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto'; // 高さをリセット
            textarea.style.height = textarea.scrollHeight + 'px'; // コンテンツに合わせて調整
        });
    }

    // テキスト要素の編集
    editTextElement(textElement) {
        const textarea = document.createElement('textarea');
        textarea.className = 'text-input-field';
        textarea.style.left = `${textElement.x * this.charWidth}px`;
        textarea.style.top = `${textElement.y * this.charHeight}px`;
        textarea.style.width = '200px'; // 適切な幅
        textarea.style.height = '40px'; // 初期高さ
        textarea.style.resize = 'both'; // ユーザーがリサイズ可能
        textarea.value = textElement.text; // 既存のテキストを設定

        this.asciiContent.appendChild(textarea);
        textarea.focus();

        // テキストの最後にカーソルを移動
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        const finishText = () => {
            const newText = textarea.value.trim();
            if (newText) {
                // テキスト要素を更新
                textElement.text = newText;
                textElement.element.textContent = newText;
            } else {
                // 空の場合は要素を削除
                const index = this.asciiElements.indexOf(textElement);
                if (index > -1) {
                    this.asciiElements.splice(index, 1);
                    textElement.element.remove();
                }
            }
            textarea.remove();
        };

        // IME入力中の誤操作を防ぐ
        let isComposing = false;

        textarea.addEventListener('compositionstart', () => {
            isComposing = true;
        });

        textarea.addEventListener('compositionend', () => {
            isComposing = false;
        });

        textarea.addEventListener('blur', finishText);

        // キーボードイベント処理
        textarea.addEventListener('keydown', (e) => {
            // Escapeキーでキャンセル（変更を破棄）
            if (e.key === 'Escape') {
                e.preventDefault();
                textarea.remove();
                return;
            }

            // Ctrl+EnterまたはCmd+Enterで確定
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                finishText();
                return;
            }

            // その他のキーはデフォルトの動作を許可（Backspace, Delete, Enter, Arrowキーなど）
        });

        // 自動で高さを調整
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        });
    }

    createTextElement(x, y, text, existingId = null) {
        const element = document.createElement('div');
        const id = existingId || crypto.randomUUID();
        element.className = 'ascii-element text';
        element.style.position = 'absolute';
        element.style.left = `${x * this.charWidth}px`;
        element.style.top = `${y * this.charHeight}px`;
        element.textContent = text;
        element.style.whiteSpace = 'pre';
        element.dataset.uuid = id;

        return {
            type: 'text',
            element: element,
            id: id,
            x: x,
            y: y,
            text: text
        };
    }

    // 選択機能
    handleSelection(e, pos) {
        this.clearSelection();

        console.debug('Selection - Grid position:', pos);

        // クリックされた要素をUUIDで検索
        const clickedElement = this.findElementByTarget(e.target);
        if (clickedElement) {
            console.debug('Element found:', clickedElement.type, 'at', { x: clickedElement.x, y: clickedElement.y });
            this.selectElement(clickedElement);
            // ドラッグ開始位置を設定
            this.dragStartX = pos.x;
            this.dragStartY = pos.y;
            this.hasDragStarted = false; // ドラッグ開始フラグをリセット
            console.debug('Drag start set to:', { x: this.dragStartX, y: this.dragStartY });
        } else {
            console.debug('No element found at position:', pos);
        }
    }

    handleDrag(e, pos) {
        if (!this.selectedElement) return;

        // ドラッグ開始のしきい値をチェック
        const deltaX = Math.abs(pos.x - this.dragStartX);
        const deltaY = Math.abs(pos.y - this.dragStartY);

        if (!this.hasDragStarted && (deltaX < this.dragThreshold && deltaY < this.dragThreshold)) {
            // しきい値未満の場合はドラッグ開始しない
            return;
        }

        // ドラッグ開始を検出
        if (!this.hasDragStarted) {
            this.hasDragStarted = true;
            this.isDragging = true;
            // 移動開始時にリサイズハンドルを非表示
            this.hideResizeHandles();
        }

        console.debug('Drag - Current pos:', pos, 'Start pos:', { x: this.dragStartX, y: this.dragStartY });

        const moveDeltaX = pos.x - this.dragStartX;
        const moveDeltaY = pos.y - this.dragStartY;

        console.debug('Move Delta:', { moveDeltaX, moveDeltaY });

        this.moveElement(this.selectedElement, moveDeltaX, moveDeltaY);
        this.dragStartX = pos.x;
        this.dragStartY = pos.y;

        console.debug('Element moved to new position:', { x: this.selectedElement.x, y: this.selectedElement.y });
    }

    findElementAt(x, y) {
        // z-index順にソートして検索（最前面からチェック）
        const sortedElements = [...this.asciiElements].sort((a, b) => {
            const aZIndex = parseInt(a.element.style.zIndex) || 0;
            const bZIndex = parseInt(b.element.style.zIndex) || 0;
            return bZIndex - aZIndex;
        });

        for (const element of sortedElements) {
            if (this.isPointInElement(x, y, element)) {
                return element;
            }
        }
        return null;
    }

    // UUIDで要素を検索
    findElementByTarget(target) {
        // ターゲットがASCII要素でない場合は親要素をたどる
        let element = target;
        while (element && element !== this.asciiContent) {
            if (element.classList.contains('ascii-element') && element.dataset.uuid) {
                const uuid = element.dataset.uuid;
                return this.asciiElements.find(el => el.id === uuid);
            }
            element = element.parentElement;
        }
        return null;
    }

    isPointInElement(x, y, element) {
        switch (element.type) {
            case 'rectangle':
                return x >= element.x && x < element.x + element.width &&
                       y >= element.y && y < element.y + element.height;
            case 'line':
                return element.points.some(point =>
                    x === element.x + point.x && y === element.y + point.y
                );
            case 'text':
                const lines = element.text.split('\n');
                return x >= element.x && x < element.x + Math.max(...lines.map(l => l.length)) &&
                       y >= element.y && y < element.y + lines.length;
        }
        return false;
    }

    selectElement(element) {
        this.clearSelection();
        this.selectedElement = element;
        element.element.classList.add('selected');

        this.showResizeHandles(element);
    }

    clearSelection() {
        if (this.selectedElement) {
            this.selectedElement.element.classList.remove('selected');
            this.selectedElement = null;
        }
        this.hideResizeHandles();
        this.isDragging = false; // 移動フラグもリセット
        this.hasDragStarted = false; // ドラッグ開始フラグもリセット
    }

    // リサイズハンドルを表示
    showResizeHandles(element) {
        this.hideResizeHandles();

        const rect = element.element.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();

        let handles = [];

        if (element.type === 'rectangle') {
            // 矩形：四隅と四辺の中央にハンドルを配置
            handles = [
                { type: 'nw', x: rect.left - canvasRect.left - 4, y: rect.top - canvasRect.top - 4 },
                { type: 'ne', x: rect.right - canvasRect.left - 4, y: rect.top - canvasRect.top - 4 },
                { type: 'sw', x: rect.left - canvasRect.left - 4, y: rect.bottom - canvasRect.top - 4 },
                { type: 'se', x: rect.right - canvasRect.left - 4, y: rect.bottom - canvasRect.top - 4 },
                { type: 'n', x: rect.left - canvasRect.left + rect.width / 2 - 4, y: rect.top - canvasRect.top - 4 },
                { type: 's', x: rect.left - canvasRect.left + rect.width / 2 - 4, y: rect.bottom - canvasRect.top - 4 },
                { type: 'w', x: rect.left - canvasRect.left - 4, y: rect.top - canvasRect.top + rect.height / 2 - 4 },
                { type: 'e', x: rect.right - canvasRect.left - 4, y: rect.top - canvasRect.top + rect.height / 2 - 4 }
            ];
        } else if (element.type === 'line') {
            // 直線：両端にハンドルを配置
            if (element.points.length >= 2) {
                const startPoint = element.points[0];
                const endPoint = element.points[element.points.length - 1];

                // 線の向きに応じて適切なrectプロパティを選択
                let startX, startY, endX, endY;

                // 始点と終点の相対位置を判断
                if (startPoint.x <= endPoint.x && startPoint.y <= endPoint.y) {
                    // 左上から右下へ (╱)
                    startX = rect.left - canvasRect.left;
                    startY = rect.top - canvasRect.top;
                    endX = rect.right - canvasRect.left;
                    endY = rect.bottom - canvasRect.top;
                } else if (startPoint.x <= endPoint.x && startPoint.y >= endPoint.y) {
                    // 左下から右上へ (╲)
                    startX = rect.left - canvasRect.left;
                    startY = rect.bottom - canvasRect.top;
                    endX = rect.right - canvasRect.left;
                    endY = rect.top - canvasRect.top;
                } else if (startPoint.x >= endPoint.x && startPoint.y <= endPoint.y) {
                    // 右上から左下へ (╱)
                    startX = rect.right - canvasRect.left;
                    startY = rect.top - canvasRect.top;
                    endX = rect.left - canvasRect.left;
                    endY = rect.bottom - canvasRect.top;
                } else {
                    // 右下から左上へ (╲)
                    startX = rect.right - canvasRect.left;
                    startY = rect.bottom - canvasRect.top;
                    endX = rect.left - canvasRect.left;
                    endY = rect.top - canvasRect.top;
                }

                handles = [
                    {
                        type: 'start',
                        x: startX - 4,
                        y: startY - 4
                    },
                    {
                        type: 'end',
                        x: endX - 4,
                        y: endY - 4
                    }
                ];
            }
        }

        handles.forEach(handle => {
            const handleEl = document.createElement('div');
            handleEl.className = `resize-handle ${handle.type}`;
            handleEl.style.left = `${handle.x}px`;
            handleEl.style.top = `${handle.y}px`;
            handleEl.dataset.handleType = handle.type;

            this.asciiContent.appendChild(handleEl);
            this.resizeHandles.push(handleEl);
        });
    }

    // リサイズハンドルを非表示
    hideResizeHandles() {
        this.resizeHandles.forEach(handle => handle.remove());
        this.resizeHandles = [];
    }

    // リサイズハンドル上のマウスダウンを処理
    handleResizeMouseDown(e, handleType) {
        e.stopPropagation();
        if (!this.selectedElement) return;
        if (this.selectedElement.type !== 'rectangle' && this.selectedElement.type !== 'line') return;

        this.isResizing = true;
        this.resizeHandle = handleType;
        this.resizeStartX = e.clientX;
        this.resizeStartY = e.clientY;

        if (this.selectedElement.type === 'rectangle') {
            this.resizeStartWidth = this.selectedElement.width;
            this.resizeStartHeight = this.selectedElement.height;
            this.resizeStartLeft = this.selectedElement.x;
            this.resizeStartTop = this.selectedElement.y;
        } else if (this.selectedElement.type === 'line') {
            // 直線のリサイズ開始時情報を保存
            this.resizeStartLinePoints = JSON.parse(JSON.stringify(this.selectedElement.points));
            this.resizeStartLineX = this.selectedElement.x;
            this.resizeStartLineY = this.selectedElement.y;
        }
    }

    // リサイズ処理
    handleResize(e) {
        if (!this.isResizing || !this.selectedElement) return;

        if (this.selectedElement.type === 'rectangle') {
            this.handleRectangleResize(e);
        } else if (this.selectedElement.type === 'line') {
            this.handleLineResize(e);
        }
    }

    // 矩形のリサイズ処理
    handleRectangleResize(e) {
        const deltaX = e.clientX - this.resizeStartX;
        const deltaY = e.clientY - this.resizeStartY;

        const gridDeltaX = Math.round(deltaX / this.charWidth);
        const gridDeltaY = Math.round(deltaY / this.charHeight);

        let newX = this.resizeStartLeft;
        let newY = this.resizeStartTop;
        let newWidth = this.resizeStartWidth;
        let newHeight = this.resizeStartHeight;

        switch (this.resizeHandle) {
            case 'se':
                newWidth = Math.max(2, this.resizeStartWidth + gridDeltaX);
                newHeight = Math.max(2, this.resizeStartHeight + gridDeltaY);
                break;
            case 'sw':
                newX = this.resizeStartLeft + gridDeltaX;
                newWidth = Math.max(2, this.resizeStartWidth - gridDeltaX);
                newHeight = Math.max(2, this.resizeStartHeight + gridDeltaY);
                break;
            case 'ne':
                newY = this.resizeStartTop + gridDeltaY;
                newWidth = Math.max(2, this.resizeStartWidth + gridDeltaX);
                newHeight = Math.max(2, this.resizeStartHeight - gridDeltaY);
                break;
            case 'nw':
                newX = this.resizeStartLeft + gridDeltaX;
                newY = this.resizeStartTop + gridDeltaY;
                newWidth = Math.max(2, this.resizeStartWidth - gridDeltaX);
                newHeight = Math.max(2, this.resizeStartHeight - gridDeltaY);
                break;
            case 'n':
                newY = this.resizeStartTop + gridDeltaY;
                newHeight = Math.max(2, this.resizeStartHeight - gridDeltaY);
                break;
            case 's':
                newHeight = Math.max(2, this.resizeStartHeight + gridDeltaY);
                break;
            case 'w':
                newX = this.resizeStartLeft + gridDeltaX;
                newWidth = Math.max(2, this.resizeStartWidth - gridDeltaX);
                break;
            case 'e':
                newWidth = Math.max(2, this.resizeStartWidth + gridDeltaX);
                break;
        }

        // 幅と高さを調整（位置が変わる場合）
        if (this.resizeHandle === 'sw' || this.resizeHandle === 'nw' || this.resizeHandle === 'w') {
            if (newX !== this.selectedElement.x) {
                this.selectedElement.x = newX;
                this.selectedElement.width = newWidth;
            }
        } else {
            this.selectedElement.width = newWidth;
        }

        if (this.resizeHandle === 'nw' || this.resizeHandle === 'ne' || this.resizeHandle === 'n') {
            if (newY !== this.selectedElement.y) {
                this.selectedElement.y = newY;
                this.selectedElement.height = newHeight;
            }
        } else {
            this.selectedElement.height = newHeight;
        }

        // 矩形要素を再生成
        this.regenerateRectangle(this.selectedElement);
        this.showResizeHandles(this.selectedElement);
    }

    // 直線のリサイズ処理（削除して再作成）
    handleLineResize(e) {
        const deltaX = e.clientX - this.resizeStartX;
        const deltaY = e.clientY - this.resizeStartY;

        const gridDeltaX = Math.round(deltaX / this.charWidth);
        const gridDeltaY = Math.round(deltaY / this.charHeight);

        let newStartX = this.resizeStartLineX;
        let newStartY = this.resizeStartLineY;
        let newEndX, newEndY;

        // 絶対座標の始点と終点を計算
        const startPoint = this.resizeStartLinePoints[0];
        const endPoint = this.resizeStartLinePoints[this.resizeStartLinePoints.length - 1];

        const absoluteStartX = this.resizeStartLineX + startPoint.x;
        const absoluteStartY = this.resizeStartLineY + startPoint.y;
        const absoluteEndX = this.resizeStartLineX + endPoint.x;
        const absoluteEndY = this.resizeStartLineY + endPoint.y;

        if (this.resizeHandle === 'start') {
            // 始点を移動
            newStartX = absoluteStartX + gridDeltaX;
            newStartY = absoluteStartY + gridDeltaY;
            newEndX = absoluteEndX;
            newEndY = absoluteEndY;
        } else if (this.resizeHandle === 'end') {
            // 終点を移動
            newStartX = absoluteStartX;
            newStartY = absoluteStartY;
            newEndX = absoluteEndX + gridDeltaX;
            newEndY = absoluteEndY + gridDeltaY;
        }

        // 現在の直線を削除
        const index = this.asciiElements.indexOf(this.selectedElement);
        if (index > -1) {
            this.asciiElements.splice(index, 1);
            this.selectedElement.element.remove();
        }

        // 新しい直線を作成
        const linePoints = this.getLinePoints(newStartX, newStartY, newEndX, newEndY);
        if (linePoints.length >= 2) {
            const newLine = this.createLineElement(linePoints, this.selectedElement.id);
            this.asciiElements.push(newLine);
            this.asciiContent.appendChild(newLine.element);
            this.selectedElement = newLine;
            this.selectedElement.element.classList.add('selected');

            // リサイズハンドルを再表示
            this.showResizeHandles(this.selectedElement);
        }
    }

    // 矩形要素を再生成
    regenerateRectangle(rectangle) {
        // 既存のUUIDを保持して新しいDOM要素のみ生成
        const newElement = this.createRectangleElement(
            rectangle.x,
            rectangle.y,
            rectangle.width,
            rectangle.height,
            rectangle.id  // 既存のUUIDを渡す
        );

        // 既存の要素を置き換え
        rectangle.element.remove();
        rectangle.element = newElement.element;
        this.asciiContent.appendChild(rectangle.element);
        rectangle.element.classList.add('selected');
    }

    
    selectAll() {
        this.clearSelection();
        if (this.asciiElements.length > 0) {
            this.selectedElement = this.asciiElements[this.asciiElements.length - 1];
            this.selectedElement.element.classList.add('selected');
        }
    }

    moveElement(element, deltaX, deltaY) {
        console.debug('MoveElement - Before:', { x: element.x, y: element.y }, 'Delta:', { deltaX, deltaY });

        element.x += deltaX;
        element.y += deltaY;

        console.debug('MoveElement - After:', { x: element.x, y: element.y });

        element.element.style.left = `${element.x * this.charWidth}px`;
        element.element.style.top = `${element.y * this.charHeight}px`;

        console.debug('MoveElement - CSS set to:', {
            left: element.element.style.left,
            top: element.element.style.top
        });
    }

    // コピー＆ペースト
    copySelected() {
        if (!this.selectedElement) return;

        this.clipboard = JSON.parse(JSON.stringify(this.selectedElement));
        this.clipboard.element = null; // DOM要素はコピーしない
    }

    // ファイルにエクスポート
    exportToFile() {
        if (this.asciiElements.length === 0) {
            this.showMessage('エクスポートするオブジェクトがありません');
            return;
        }

        const exportData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            elements: this.asciiElements.map(element => {
                const copy = JSON.parse(JSON.stringify(element));
                delete copy.element; // DOM要素は含めない
                return copy;
            })
        };

        // ASCIIアートテキストを生成
        const asciiArt = this.generateAsciiArt();
        exportData.asciiArt = asciiArt;

        const jsonStr = JSON.stringify(exportData, null, 2);

        // ファイルをダウンロード
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ascii-drawing-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showMessage(`エクスポート完了！${this.asciiElements.length}個のオブジェクトをファイルに保存しました`);
    }

    // ファイルからインポート
    importFromFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importData = JSON.parse(e.target.result);

                    if (!importData.elements || !Array.isArray(importData.elements)) {
                        throw new Error('無効なデータ形式です');
                    }

                    // 既存の要素をすべて削除
                    this.asciiElements.forEach(element => {
                        element.element.remove();
                    });
                    this.asciiElements = [];

                    // 新しい要素を再作成
                    importData.elements.forEach(elementData => {
                        let newElement;

                        switch (elementData.type) {
                            case 'rectangle':
                                newElement = this.createRectangleElement(
                                    elementData.x,
                                    elementData.y,
                                    elementData.width,
                                    elementData.height
                                );
                                break;
                            case 'line':
                                newElement = this.createLineElement(
                                    elementData.points.map(p => ({
                                        x: elementData.x + p.x,
                                        y: elementData.y + p.y
                                    }))
                                );
                                break;
                            case 'text':
                                newElement = this.createTextElement(
                                    elementData.x,
                                    elementData.y,
                                    elementData.text
                                );
                                break;
                        }

                        if (newElement) {
                            this.asciiElements.push(newElement);
                            this.asciiContent.appendChild(newElement.element);
                        }

                        // 重なり順を調整（テキスト要素を最前面に）
                        this.updateZIndex();
                    });

                    this.showMessage(`インポート完了！${importData.elements.length}個のオブジェクトを復元しました`);
                } catch (err) {
                    console.error('インポートに失敗:', err);
                    this.showMessage('インポートに失敗しました。ファイル形式を確認してください');
                }
            };

            reader.readAsText(file);
        });

        input.click();
    }

    // 全オブジェクトをクリップボードにコピー
    copyAllToClipboard() {
        if (this.asciiElements.length === 0) {
            this.showMessage('コピーするオブジェクトがありません');
            return;
        }

        const asciiArt = this.generateAsciiArt();

        // クリップボードにコピー
        navigator.clipboard.writeText(asciiArt).then(() => {
            this.showMessage(`コピー完了！${this.asciiElements.length}個のオブジェクトをASCIIアートとしてクリップボードにコピーしました`);
        }).catch(err => {
            console.error('クリップボードへのコピーに失敗:', err);
            this.showMessage('クリップボードへのコピーに失敗しました');
        });
    }

    // CJK文字の幅を取得
    getCharWidth(char) {
        // CJK文字（日本語、中国語、韓国語など）は幅2、その他は幅1
        const code = char.charCodeAt(0);

        // 基本的なCJK文字の範囲
        if (
            (code >= 0x4E00 && code <= 0x9FFF) || // CJK統合漢字
            (code >= 0x3040 && code <= 0x309F) || // ひらがな
            (code >= 0x30A0 && code <= 0x30FF) || // カタカナ
            (code >= 0x31F0 && code <= 0x31FF) || // ひらがな拡張
            (code >= 0x3200 && code <= 0x32FF) || // CJK記号・句読点
            (code >= 0x3300 && code <= 0x33FF) || // CJK互換用文字
            (code >= 0xFF00 && code <= 0xFFEF) || // 半角・全角フォーム
            (code >= 0x3400 && code <= 0x4DBF)    // CJK統合漢字拡張A
        ) {
            return 2;
        }

        // その他の特殊な全角文字
        if (
            (code >= 0x2500 && code <= 0x257F) || // 罫線文字
            (code >= 0x2580 && code <= 0x259F)    // ブロック要素
        ) {
            return 1;
        }

        return 1;
    }

    // 文字列の表示幅を計算
    getStringWidth(str) {
        let width = 0;
        for (let i = 0; i < str.length; i++) {
            width += this.getCharWidth(str[i]);
        }
        return width;
    }

    // ASCIIアートテキストを生成
    generateAsciiArt() {
        if (this.asciiElements.length === 0) return '';

        // 全要素の範囲を計算（文字幅を考慮）
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        this.asciiElements.forEach(element => {
            switch (element.type) {
                case 'rectangle':
                    minX = Math.min(minX, element.x);
                    minY = Math.min(minY, element.y);
                    maxX = Math.max(maxX, element.x + element.width);
                    maxY = Math.max(maxY, element.y + element.height);
                    break;
                case 'line':
                    element.points.forEach(point => {
                        minX = Math.min(minX, element.x + point.x);
                        minY = Math.min(minY, element.y + point.y);
                        maxX = Math.max(maxX, element.x + point.x + 1);
                        maxY = Math.max(maxY, element.y + point.y + 1);
                    });
                    break;
                case 'text':
                    const lines = element.text.split('\n');
                    minX = Math.min(minX, element.x);
                    minY = Math.min(minY, element.y);
                    const maxWidth = Math.max(...lines.map(l => this.getStringWidth(l)));
                    maxX = Math.max(maxX, element.x + maxWidth);
                    maxY = Math.max(maxY, element.y + lines.length);
                    break;
            }
        });

        // キャンバスを作成（文字単位）
        const width = maxX - minX;
        const height = maxY - minY;
        const canvas = Array(height).fill(null).map(() => Array(width).fill(' '));

        // 各要素をキャンバスに描画
        this.asciiElements.forEach(element => {
            switch (element.type) {
                case 'rectangle':
                    for (let y = 0; y < element.height; y++) {
                        for (let x = 0; x < element.width; x++) {
                            const canvasX = element.x - minX + x;
                            const canvasY = element.y - minY + y;
                            if (canvasY >= 0 && canvasY < height && canvasX >= 0 && canvasX < width) {
                                if (y === 0 && x === 0) {
                                    canvas[canvasY][canvasX] = '┌';
                                } else if (y === 0 && x === element.width - 1) {
                                    canvas[canvasY][canvasX] = '┐';
                                } else if (y === element.height - 1 && x === 0) {
                                    canvas[canvasY][canvasX] = '└';
                                } else if (y === element.height - 1 && x === element.width - 1) {
                                    canvas[canvasY][canvasX] = '┘';
                                } else if (y === 0 || y === element.height - 1) {
                                    canvas[canvasY][canvasX] = '─';
                                } else if (x === 0 || x === element.width - 1) {
                                    canvas[canvasY][canvasX] = '│';
                                }
                            }
                        }
                    }
                    break;

                case 'line':
                    element.points.forEach(point => {
                        const canvasX = element.x + point.x - minX;
                        const canvasY = element.y + point.y - minY;
                        if (canvasY >= 0 && canvasY < height && canvasX >= 0 && canvasX < width) {
                            canvas[canvasY][canvasX] = '─';
                        }
                    });
                    break;

                case 'text':
                    const lines = element.text.split('\n');
                    lines.forEach((line, lineIndex) => {
                        let currentX = element.x - minX;
                        const canvasY = element.y - minY + lineIndex;

                        if (canvasY >= 0 && canvasY < height) {
                            for (let i = 0; i < line.length; i++) {
                                const char = line[i];
                                const charWidth = this.getCharWidth(char);

                                if (currentX >= 0 && currentX < width && charWidth === 1) {
                                    canvas[canvasY][currentX] = char;
                                } else if (currentX >= 0 && currentX + 1 < width && charWidth === 2) {
                                    // 全角文字の場合は2文字分を確保
                                    canvas[canvasY][currentX] = char;
                                    canvas[canvasY][currentX + 1] = ''; // 空白で埋める
                                }

                                currentX += charWidth;
                            }
                        }
                    });
                    break;
            }
        });

        return canvas.map(row => row.join('')).join('\n');
    }

    // メッセージ表示
    showMessage(message) {
        // 既存のメッセージがあれば削除
        const existingMessage = document.querySelector('.ascii-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const messageEl = document.createElement('div');
        messageEl.className = 'ascii-message';
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px 20px;
            border-radius: 5px;
            z-index: 10000;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            max-width: 80%;
            text-align: center;
            border: 1px solid #007acc;
        `;

        document.body.appendChild(messageEl);

        // 3秒後に自動削除
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.remove();
            }
        }, 3000);
    }

    paste() {
        if (!this.clipboard) return;

        let newElement;
        switch (this.clipboard.type) {
            case 'rectangle':
                newElement = this.createRectangleElement(
                    this.clipboard.x + 1,
                    this.clipboard.y + 1,
                    this.clipboard.width,
                    this.clipboard.height
                );
                break;
            case 'line':
                const points = this.clipboard.points.map(p => ({ x: p.x, y: p.y }));
                newElement = {
                    type: 'line',
                    element: null,
                    points: points,
                    x: this.clipboard.x + 1,
                    y: this.clipboard.y + 1
                };
                break;
            case 'text':
                newElement = this.createTextElement(
                    this.clipboard.x + 1,
                    this.clipboard.y + 1,
                    this.clipboard.text
                );
                break;
        }

        if (newElement) {
            // lineの場合は要素を再生成
            if (newElement.type === 'line' && !newElement.element) {
                const lineElement = this.createLineElement(
                    newElement.points.map(p => ({
                        x: newElement.x + p.x,
                        y: newElement.y + p.y
                    }))
                );
                newElement = lineElement;
            }

            this.asciiElements.push(newElement);
            this.asciiContent.appendChild(newElement.element);

            // 重なり順を調整（テキスト要素を最前面に）
            this.updateZIndex();

            this.selectElement(newElement);
        }
    }

    deleteSelected() {
        if (!this.selectedElement) return;

        const index = this.asciiElements.indexOf(this.selectedElement);
        if (index > -1) {
            this.asciiElements.splice(index, 1);
            this.selectedElement.element.remove();
            this.clearSelection(); // clearSelectionを呼ぶことでリサイズハンドルも非表示になる
        }
    }

    // ユーティリティ
    clearPreview() {
        const previews = this.asciiContent.querySelectorAll('.drag-preview');
        previews.forEach(preview => preview.remove());
    }

    // z-indexを更新して 文字 > 直線 > 矩形 の優先順位でレイヤーを管理
    updateZIndex() {
        // 要素タイプごとにグループ化
        const textElements = this.asciiElements.filter(el => el.type === 'text');
        const lineElements = this.asciiElements.filter(el => el.type === 'line');
        const rectangleElements = this.asciiElements.filter(el => el.type === 'rectangle');

        let zIndex = 10;

        // 矩形要素（最背面）
        rectangleElements.forEach(element => {
            element.element.style.zIndex = 100 + zIndex++;
        });

        // 直線要素（中間レイヤー）
        lineElements.forEach(element => {
            element.element.style.zIndex = 300 + zIndex++;
        });

        // テキスト要素（最前面）
        textElements.forEach(element => {
            element.element.style.zIndex = 500 + zIndex++;
        });
    }

    updateCanvasSize() {
        // キャンバスサイズを十分に大きく設定
        const width = Math.max(window.innerWidth * 2, 4096);
        const height = Math.max(window.innerHeight * 2, 4096);

        this.asciiContent.style.width = `${width}px`;
        this.asciiContent.style.height = `${height}px`;
    }
}

// アプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    new AsciiDrawer();
});