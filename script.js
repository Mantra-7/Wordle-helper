
// New Wordle Helper using a 5x6 grid
document.addEventListener('DOMContentLoaded', () => {
	const resetBtn = document.getElementById('reset');
	const numPos = document.getElementById('numpos');
	const ansPos = document.getElementById('anspos');
	const switchEl = document.getElementById('switch');
	const grid = document.getElementById('grid');

	const answers = POSSIBLE_ANSWERS.map(s => s.toLowerCase());
	const guesses = POSSIBLE_GUESSES.map(s => s.toLowerCase());

	// last computed candidate list (set when Update is pressed)
	let lastResults = null;

	// list of entered rows (each is {letters: [a..e], statuses: [s..s]})
	let enteredRows = [];

	function setTileStatus(tile, status){
		tile.dataset.status = status || '';
		tile.classList.remove('tile--green','tile--yellow','tile--gray');
		if(status === 'green') tile.classList.add('tile--green');
		if(status === 'yellow') tile.classList.add('tile--yellow');
		if(status === 'gray') tile.classList.add('tile--gray');
	}

	function createTile(row, col){
		const t = document.createElement('input');
		t.className = 'grid-tile';
		t.setAttribute('maxlength','1');
		t.dataset.row = String(row);
		t.dataset.col = String(col);
		t.value = '';
		t.dataset.status = '';
		// flag set during paste so the input handler doesn't interfere
		t._pasting = false;
		// flag: set by keydown when it already handled a letter, so input doesn't double-process
		t._keydownHandled = false;
		// flag: a keydown fired after the most recent mousedown — suppress color cycle on click
		t._keyAfterMousedown = false;
		t.addEventListener('mousedown', () => { t._keyAfterMousedown = false; });
		t.addEventListener('keydown', () => { t._keyAfterMousedown = true; }, true); // capture phase
		t.addEventListener('click', () => {
			// only cycle color when there's a letter in the tile AND no key was pressed
			// between mousedown and click (which would mean the click was just to focus/type)
			if(!(t.value || '').trim()) return;
			if(t._keyAfterMousedown) return;
			// cycle order: gray -> yellow -> green -> gray
			const order = ['gray', 'yellow', 'green'];
			const cur = t.dataset.status || '';
			let idx = order.indexOf(cur);
			if(idx === -1) idx = 0; // treat non-colored as gray
			const next = order[(idx + 1) % order.length];
			setTileStatus(t, next);
		});
		t.addEventListener('input', () => {
			// skip when a paste operation is handling the update itself
			if(t._pasting) return;
			// On desktop, keydown handles letter input and focus movement.
			// On mobile (virtual keyboard), keydown may not fire — input fires instead.
			// _keydownHandled is set by the keydown handler so we don't double-process.
			if(t._keydownHandled){ t._keydownHandled = false; return; }

			const rawVal = (t.value || '');
			// normalize to single uppercase character (keep last typed character)
			const letter = rawVal.replace(/[^a-zA-Z]/g, '').slice(-1).toUpperCase();
			t.value = letter;

			if(letter){
				const L = letter.toLowerCase();
				const colIdx = Number(t.dataset.col);
				const rowEl = t.closest('.row-grid');
				const allTiles = rowEl ? Array.from(rowEl.querySelectorAll('.grid-tile')) : [];

				// set status on the current tile first
				const inferred = inferStatusForLetter(L, colIdx);
				setTileStatus(t, inferred || 'gray');

				// ── move focus to next empty cell (same logic as keydown) ──────────
				// find next empty tile to the right; wrap around if needed
				let target = allTiles.find(tile => Number(tile.dataset.col) > colIdx && !(tile.value || '').trim());
				if(!target){
					target = allTiles.find(tile => Number(tile.dataset.col) < colIdx && !(tile.value || '').trim());
				}
				if(target) target.focus();
			} else {
				// cleared letter -> clear status
				setTileStatus(t, '');
			}
		});

		// handle key actions: printable letters, navigation, shortcuts
		t.addEventListener('keydown', (e) => {
			const rowIdx = Number(t.dataset.row);
			const colIdx = Number(t.dataset.col);

			// ── printable letter: place in next empty cell to the right ──────
			if(e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)){
				// let Ctrl/Meta combos (Ctrl+V, Ctrl+C, etc.) pass through to the browser
				if(e.ctrlKey || e.metaKey) return;
				e.preventDefault();
				const rowEl = t.closest('.row-grid');
				const allTiles = rowEl ? Array.from(rowEl.querySelectorAll('.grid-tile')) : [];

				// if the current tile is empty, use it directly
				let target = !(t.value || '').trim() ? t : null;
				if(!target){
					// look for the closest empty tile to the RIGHT of current col (exclusive)
					target = allTiles.find(tile => Number(tile.dataset.col) > colIdx && !(tile.value || '').trim());
				}
				// if not found to the right, wrap around from the start of the row
				if(!target){
					target = allTiles.find(tile => Number(tile.dataset.col) <= colIdx && !(tile.value || '').trim());
				}
				// if all cells are full, do nothing
				if(!target) return;

				target.value = e.key.toUpperCase();
				const L = target.value.toLowerCase();
				const targetCol = Number(target.dataset.col);
				const inferred = inferStatusForLetter(L, targetCol);
				if(inferred) setTileStatus(target, inferred); else setTileStatus(target, 'gray');
				target.focus();
				// tell the input handler that keydown already handled this keystroke
				target._keydownHandled = true;
				return;
			}

			// ── Backspace: clear current tile or move back if already empty ───
			if(e.key === 'Backspace'){
				e.preventDefault();
				if((t.value || '').trim()){
					// tile has a letter — clear it
					t.value = '';
					setTileStatus(t, '');
				} else {
					// tile is empty — move focus to previous tile (don't clear it)
					if(colIdx > 0){
						const prev = document.querySelector(`.grid-tile[data-row="${rowIdx}"][data-col="${colIdx-1}"]`);
						if(prev) prev.focus();
					}
				}
				return;
			}

			// ── Arrow keys: move focus left / right within the row ────────────
			if(e.key === 'ArrowLeft'){
				e.preventDefault();
				if(colIdx > 0){
					const prev = document.querySelector(`.grid-tile[data-row="${rowIdx}"][data-col="${colIdx-1}"]`);
					if(prev) prev.focus();
				}
				return;
			}
			if(e.key === 'ArrowRight'){
				e.preventDefault();
				if(colIdx < 4){
					const next = document.querySelector(`.grid-tile[data-row="${rowIdx}"][data-col="${colIdx+1}"]`);
					if(next) next.focus();
				}
				return;
			}

			// ── Space bar: cycle color of the focused tile ────────────────────
			if(e.key === ' '){
				e.preventDefault();
				if((t.value || '').trim()){
					const order = ['gray', 'yellow', 'green'];
					const cur = t.dataset.status || '';
					let idx = order.indexOf(cur);
					if(idx === -1) idx = 0;
					setTileStatus(t, order[(idx + 1) % order.length]);
				}
				return;
			}

			// ── Enter: submit the row if all 5 tiles are filled ──────────────
			if(e.key === 'Enter'){
				e.preventDefault();
				const rowEl = t.closest('.row-grid');
				const allTiles = rowEl ? Array.from(rowEl.querySelectorAll('.grid-tile')) : [];
				const allFilled = allTiles.length === 5 && allTiles.every(tile => (tile.value || '').trim() !== '');
				if(allFilled){
					const enterBtn = rowEl.querySelector('.enter-row');
					if(enterBtn && !enterBtn.disabled) enterBtn.click();
				} else {
					// move to next empty tile, or just next tile
					const nextEmpty = allTiles.find(tile => !tile.value.trim() && Number(tile.dataset.col) > colIdx);
					const nextTile = nextEmpty || document.querySelector(`.grid-tile[data-row="${rowIdx}"][data-col="${Math.min(4, colIdx+1)}"]`);
					if(nextTile) nextTile.focus();
				}
			}
		});

		// ── Paste: distribute a pasted word across the row's tiles ───────────
		t.addEventListener('paste', (e) => {
			e.preventDefault();
			const rowIdx = Number(t.dataset.row);
			const colIdx = Number(t.dataset.col);
			const text = (e.clipboardData || window.clipboardData).getData('text');
			// strip non-alpha characters and take up to 5 letters starting from current col
			const letters = text.replace(/[^a-zA-Z]/g, '').toUpperCase().split('');
			let focusedCol = colIdx;
			for(let i = 0; i < letters.length && colIdx + i <= 4; i++){
				const targetCol = colIdx + i;
				const tile = document.querySelector(`.grid-tile[data-row="${rowIdx}"][data-col="${targetCol}"]`);
				if(!tile || tile.disabled) break;
				// suppress the input handler while we set the value directly
				tile._pasting = true;
				tile.value = letters[i];
				tile._pasting = false;
				const L = letters[i].toLowerCase();
				const inferred = inferStatusForLetter(L, targetCol);
				if(inferred) setTileStatus(tile, inferred); else setTileStatus(tile, 'gray');
				focusedCol = targetCol;
			}
			// focus the tile after the last filled one (or stay on the last tile)
			const nextCol = Math.min(4, focusedCol + (focusedCol < 4 ? 1 : 0));
			const nextTile = document.querySelector(`.grid-tile[data-row="${rowIdx}"][data-col="${nextCol}"]`);
			if(nextTile) nextTile.focus();
		});

		return t;
	}

	function createRow(rowIndex){
		const row = document.createElement('div');
		row.className = 'row-grid';
		row.dataset.row = String(rowIndex);

		// reset-row button (left of tiles): clears this row and removes all rows after it
		const resetRowBtn = document.createElement('button');
		resetRowBtn.type = 'button';
		resetRowBtn.className = 'btn btn-sm btn-outline-danger reset-row';
		resetRowBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>';
		resetRowBtn.title = 'Clear this row and remove all rows after it';
		resetRowBtn.style.marginRight = '6px';
		resetRowBtn.addEventListener('click', () => {
			const thisRowIndex = Number(row.dataset.row);

			// remove all grid rows with a higher row index than this one
			const allRowEls = Array.from(grid.querySelectorAll('.row-grid'));
			allRowEls.forEach(r => {
				if(Number(r.dataset.row) > thisRowIndex) r.remove();
			});

			// drop enteredRows entries for this row index and beyond
			// enteredRows are pushed in order, so find how many rows have index < thisRowIndex
			const rowsBefore = allRowEls.filter(r => Number(r.dataset.row) < thisRowIndex);
			enteredRows = enteredRows.slice(0, rowsBefore.length);

			// clear & unlock the current row
			const tiles = Array.from(row.querySelectorAll('.grid-tile'));
			tiles.forEach(t => {
				t.value = '';
				setTileStatus(t, '');
				t.disabled = false;
				t.classList.remove('locked', 'conflict');
			});

			// re-enable the Enter button if it was disabled
			const enterBtn = row.querySelector('.enter-row');
			if(enterBtn) enterBtn.disabled = false;

			// remove any warning on this row
			const warn = row.querySelector('.enter-warning');
			if(warn) warn.remove();

			// focus first tile of this row
			if(tiles[0]) tiles[0].focus();
		});
		row.appendChild(resetRowBtn);

		// create five tiles
		for(let c=0;c<5;c++){
			const tile = createTile(rowIndex, c);
			row.appendChild(tile);
		}
		// enter button for this row
		const enterBtn = document.createElement('button');
		enterBtn.type = 'button';
		enterBtn.className = 'btn btn-sm btn-primary enter-row';
		enterBtn.textContent = 'Enter';
		enterBtn.style.marginLeft = '8px';
		enterBtn.addEventListener('click', () => {
			// gather the row's letters & statuses and store it if it's a full 5-letter word
			const tiles = Array.from(row.querySelectorAll('.grid-tile'));
			const letters = tiles.map(t => (t.value || '').toLowerCase());
			const statuses = tiles.map(t => t.dataset.status || '');
			// only store if all five positions have a letter
			const full = letters.every(l => (l || '').trim() !== '');
			// helper: find any same-index color conflict with previously entered rows.
			// A "conflict" is a same-position same-letter status mismatch that cannot be
			// explained by double-letter semantics.
			// Exception: yellow/green → gray at the same position is VALID when the new
			// row also contains the same letter as green or yellow at a *different* position
			// (the gray is an "excess copy" marker, not a contradiction).
			function findConflict(newLetters, newStatuses){
				// ── Pre-compute summaries of every previously entered row ─────────────
				// For each previous row, derive per-letter facts we'll need for all checks.
				//
				// prevGreenPos[letter]  : Set of positions where letter was green (across ALL prev rows)
				// prevYellowPos[letter] : Set of positions where letter was yellow (across ALL prev rows)
				// prevAbsent[letter]    : true if letter appeared ONLY as gray in some row
				//                        (i.e. completely absent from the hidden word,
				//                         or its exact count was exhausted by that row's greens/yellows)
				// prevExactCount[letter]: tightest exact count established by any excess-copy row
				//                        (a row where letter had both gray AND green/yellow)

				const prevGreenPos   = {}; // letter -> Set<pos>
				const prevYellowPos  = {}; // letter -> Set<pos>
				const prevAbsent     = new Set(); // letters confirmed completely absent
				const prevExactCount = {}; // letter -> number

				for(const prev of enteredRows){
					// tally per letter within this row
					const rowGreen  = {}; // letter -> count
					const rowYellow = {}; // letter -> count
					let   rowGrayLetters = new Set();

					for(let p = 0; p < prev.letters.length; p++){
						const l = (prev.letters[p] || '').toLowerCase();
						const s = prev.statuses[p] || '';
						if(!l) continue;
						if(s === 'green'){
							if(!prevGreenPos[l]) prevGreenPos[l] = new Set();
							prevGreenPos[l].add(p);
							rowGreen[l] = (rowGreen[l] || 0) + 1;
						} else if(s === 'yellow'){
							if(!prevYellowPos[l]) prevYellowPos[l] = new Set();
							prevYellowPos[l].add(p);
							rowYellow[l] = (rowYellow[l] || 0) + 1;
						} else if(s === 'gray'){
							rowGrayLetters.add(l);
						}
					}

					for(const l of rowGrayLetters){
						const nonGray = (rowGreen[l] || 0) + (rowYellow[l] || 0);
						if(nonGray === 0){
							// letter is entirely absent in the hidden word
							prevAbsent.add(l);
						} else {
							// excess-copy: exact count = nonGray for this row
							if(prevExactCount[l] === undefined || nonGray < prevExactCount[l]){
								prevExactCount[l] = nonGray;
							}
						}
					}
				}

				// ── Pre-compute summary of the NEW row ────────────────────────────────
				const newGreenPos  = {}; // letter -> [positions]
				const newYellowPos = {}; // letter -> [positions]
				const newGrayPos   = {}; // letter -> [positions]

				for(let p = 0; p < newLetters.length; p++){
					const l = (newLetters[p] || '').toLowerCase();
					const s = newStatuses[p] || '';
					if(!l) continue;
					if(s === 'green'){
						if(!newGreenPos[l])  newGreenPos[l]  = [];
						newGreenPos[l].push(p);
					} else if(s === 'yellow'){
						if(!newYellowPos[l]) newYellowPos[l] = [];
						newYellowPos[l].push(p);
					} else if(s === 'gray'){
						if(!newGrayPos[l])   newGrayPos[l]   = [];
						newGrayPos[l].push(p);
					}
				}

				// Helper: non-gray count for a letter in the new row
				function newNonGrayCount(l){
					return (newGreenPos[l] || []).length + (newYellowPos[l] || []).length;
				}

				// ── Check A: green position must stay green ───────────────────────────
				// If letter L was green at position P before, new row must also have L
				// green at P (any other color is a contradiction).
				for(const l in prevGreenPos){
					for(const p of prevGreenPos[l]){
						if(p >= newLetters.length) continue;
						const newL = (newLetters[p] || '').toLowerCase();
						const newS = newStatuses[p] || '';
						if(newL !== l) continue; // different letter typed — unrelated
						if(newS !== 'green'){
							return { pos: p, letter: l, existing: 'green', incoming: newS };
						}
					}
				}

				// ── Check B: yellow position must NOT be green ────────────────────────
				// If letter L was yellow at position P before, the hidden word does NOT
				// have L at P. So new row cannot mark L green at P.
				for(const l in prevYellowPos){
					for(const p of prevYellowPos[l]){
						if(p >= newLetters.length) continue;
						const newL = (newLetters[p] || '').toLowerCase();
						const newS = newStatuses[p] || '';
						if(newL !== l) continue;
						if(newS === 'green'){
							return { pos: p, letter: l, existing: 'yellow', incoming: 'green' };
						}
					}
				}

				// ── Check C: absent letter cannot appear as green or yellow ──────────
				// If a previous row established that letter L is completely absent
				// (gray with no green/yellow in that row), new row cannot have L as
				// green or yellow anywhere.
				for(const l of prevAbsent){
					const nonGrayPositions = [...(newGreenPos[l] || []), ...(newYellowPos[l] || [])];
					if(nonGrayPositions.length > 0){
						return { pos: nonGrayPositions[0], letter: l, existing: 'absent (gray)', incoming: newStatuses[nonGrayPositions[0]] };
					}
				}

				// ── Check D: confirmed-green letter cannot be gray everywhere ───────
				// If letter L was ever green, the word contains at least 1 copy of L.
				// So the new row must have at least 1 non-gray copy of L.
				// A gray on an *excess* copy is fine (e.g. DADDY with only 1 D in word).
				for(const l in prevGreenPos){
					if(newGrayPos[l] && newGrayPos[l].length > 0){
						// Only a conflict if there are NO non-gray copies of L in the new row
						// (meaning the user marked every occurrence of L as gray, which
						//  contradicts the earlier green).
						if(newNonGrayCount(l) === 0){
							return { pos: newGrayPos[l][0], letter: l, existing: 'green (confirmed present)', incoming: 'gray' };
						}
					}
				}

				// ── Check E: confirmed-yellow letter cannot be gray anywhere ─────────
				// Similarly, if L was yellow before (present in word), new row can't mark
				// L as gray unless the exact count is already accounted for by greens.
				for(const l in prevYellowPos){
					if(newGrayPos[l] && newGrayPos[l].length > 0){
						// Exception: if there's a known exact count and the new row's green
						// count already meets it, the gray is an excess-copy marker — valid.
						const exactMax = prevExactCount[l];
						const newGreens = (newGreenPos[l] || []).length;
						if(exactMax !== undefined && newGreens >= exactMax) continue;
						// Also valid if the new row has enough non-gray to cover the min count
						// established by yellows AND a gray co-exists (excess copy in new row).
						// We only flag it if there's no non-gray at all for this letter in new row.
						if(newNonGrayCount(l) === 0){
							return { pos: newGrayPos[l][0], letter: l, existing: 'yellow (confirmed present)', incoming: 'gray' };
						}
					}
				}

				// ── Check F: exact count not exceeded ────────────────────────────────
				// If a previous excess-copy row set an exact max for letter L, the new
				// row's non-gray count must not exceed it.
				for(const l in prevExactCount){
					const max = prevExactCount[l];
					const cnt = newNonGrayCount(l);
					if(cnt > max){
						const allNonGray = [...(newGreenPos[l] || []), ...(newYellowPos[l] || [])];
						return {
							pos: allNonGray[max], // first excess position
							letter: l,
							existing: `max ${max}`,
							incoming: `${cnt} non-gray`
						};
					}
				}

				return null;
			}

			let warn = row.querySelector('.enter-warning');
			function showWarn(msg){
				if(!warn){
					warn = document.createElement('span');
					warn.className = 'enter-warning';
					warn.style.color = 'crimson';
					warn.style.marginLeft = '8px';
					warn.style.fontSize = '0.9em';
					enterBtn.insertAdjacentElement('afterend', warn);
				}
				warn.textContent = msg;
			}
			function clearWarn(){ if(warn){ warn.remove(); warn = null; } }

			if(!full){
				showWarn('Fill all 5 letters first');
			} else {
				// validate the word is in the active word list
				const word = letters.join('');
				const source = switchEl && switchEl.checked ? answers : guesses;
				if(!source.includes(word)){
					showWarn(`"${word.toUpperCase()}" not in word list`);
				} else {
					const conflict = findConflict(letters, statuses);
					if(conflict){
						const isMaxCount = typeof conflict.existing === 'string' && conflict.existing.startsWith('max');
						const msg = isMaxCount
							? `"${conflict.letter.toUpperCase()}" appears too many times (${conflict.existing})`
							: `Conflict at pos ${conflict.pos+1}: letter "${conflict.letter.toUpperCase()}" was ${conflict.existing} before`;
						showWarn(msg);
						console.warn('Conflict prevented storing row:', conflict);
						const tile = tiles[conflict.pos];
						if(tile){ tile.classList.add('conflict'); tile.focus(); }
					} else {
						clearWarn();
						enteredRows.push({ letters, statuses });
						// lock the tiles in this row
						tiles.forEach(t => { t.disabled = true; t.classList.add('locked'); t.classList.remove('conflict'); });
						enterBtn.disabled = true;
						// after setting current row, always append an extra blank row
						addRow();
						// focus first tile of newly added row
						const rows = Array.from(document.querySelectorAll('.row-grid'));
						const last = rows[rows.length-1];
						if(last){
							const firstTile = last.querySelector('.grid-tile');
							if(firstTile) firstTile.focus();
						}
					}
				}
			}
		});
		row.appendChild(enterBtn);
		return row;
	}

	// Infer the status for a letter at a given column index using confirmed entered rows.
	// Rules (in priority order):
	//   1. If the letter is green at this exact index → green
	//   2. If the letter is gray in ANY row AND has no green/yellow anywhere → gray (globally absent)
	//   3. If the letter is yellow in ANY position → yellow (present but misplaced)
	//   4. Otherwise → null
	// Double-letter awareness:
	//   - A gray that co-exists with green/yellow in the same row is an excess-copy cap, NOT absence.
	//     Rule 2 is skipped in that case (hasNonGray guard).
	//   - A position that was a true absence-gray (letter had no non-gray in that row) stays banned,
	//     so rule 3 only fires when the letter was yellow in a different row (not just this position).
	function inferStatusForLetter(letter, index){
		if(!letter) return null;
		let greenAtIndex = false;
		let hasAbsenceGray = false;  // gray in a row where letter had NO green/yellow (truly absent)
		let hasNonGray = false;      // any green or yellow for this letter anywhere
		let hasYellow = false;
		let knownMax = Infinity; // tightest confirmed maximum (from excess-copy gray rows)

		// Collect the set of positions (other than `index`) that are confirmed non-gray for
		// this letter across all entered rows. We use a Set keyed by position so that the
		// same position confirmed across multiple rows counts only once (it's the same slot).
		const confirmedNonGrayPositions = new Set(); // positions != index that are green/yellow

		for(const rowObj of enteredRows){
			let rowNonGrayCount = 0;
			let rowHasGray = false;
			for(let pos = 0; pos < rowObj.letters.length; pos++){
				const v = (rowObj.letters[pos] || '').toLowerCase();
				if(v !== letter) continue;
				const s = rowObj.statuses[pos] || '';
				if(s === 'green' || s === 'yellow') rowNonGrayCount++;
				if(s === 'gray') rowHasGray = true;
				if(s === 'green' && pos === index) greenAtIndex = true;
				if(s === 'green' || s === 'yellow') hasNonGray = true;
				if(s === 'yellow') hasYellow = true;
				// track non-gray positions other than the one we're inferring for
				if((s === 'green' || s === 'yellow') && pos !== index){
					confirmedNonGrayPositions.add(pos);
				}
			}
			if(rowHasGray && rowNonGrayCount === 0) hasAbsenceGray = true;
			// excess-copy gray in this row → exact max = nonGray count in this row
			if(rowHasGray && rowNonGrayCount > 0 && rowNonGrayCount < knownMax){
				knownMax = rowNonGrayCount;
			}
		}

		if(greenAtIndex) return 'green';
		if(hasAbsenceGray && !hasNonGray) return 'gray';

		// If the max count is known and already fully consumed by confirmed non-gray positions
		// at other slots, this position must be an excess copy → gray.
		// Uses distinct confirmed positions (not raw counts) to avoid double-counting the
		// same slot seen as yellow in multiple rows.
		if(knownMax !== Infinity && confirmedNonGrayPositions.size >= knownMax) return 'gray';

		if(hasYellow) return 'yellow';
		return null;
	}

	function addRow(){
		const currentRows = Array.from(grid.querySelectorAll('.row-grid')).map(r=>Number(r.dataset.row));
		const next = currentRows.length ? Math.max(...currentRows)+1 : 0;
		const rowEl = createRow(next);
		grid.appendChild(rowEl);
		return rowEl;
	}

	function resetAll(){
		// Wipe the entire grid and rebuild a single fresh row
		grid.innerHTML = '';
		enteredRows = [];
		lastResults = null;
		if(ansPos) ansPos.innerHTML = '&nbsp;';
		if(numPos) numPos.textContent = '';
		addRow();
	}
	resetBtn && resetBtn.addEventListener('click', resetAll);

	function computeCandidates(){
		const source = switchEl && switchEl.checked ? answers : guesses;

		const greens = {}; // pos -> letter  (green at exact position)
		const bannedPos = {}; // letter -> Set<pos>  (yellow/gray: letter not at this position)
		const minCount = {}; // letter -> minimum occurrences required
		const maxCount = {}; // letter -> exact maximum (set when a gray co-exists with green/yellow in same row)

		function ensureL(l){
			if(!bannedPos[l]) bannedPos[l] = new Set();
			if(minCount[l] === undefined) minCount[l] = 0;
			// maxCount[l] left undefined until a gray+nonGray row is seen
		}

		// Process each confirmed row.
		// Within a single row, tally green/yellow/gray counts per letter to derive
		// minimum required and — when a gray appears alongside green/yellow — exact max.
		for(const rowObj of enteredRows){
			// per-row tallies
			const rowGreen = {}; // letter -> count of greens in this row
			const rowYellow = {}; // letter -> count of yellows in this row
			const rowGray = {}; // letter -> count of grays in this row

			for(let pos = 0; pos < rowObj.letters.length; pos++){
				const L = (rowObj.letters[pos] || '').toLowerCase();
				const status = rowObj.statuses[pos] || '';
				if(!L) continue;
				ensureL(L);
				if(status === 'green'){
					greens[pos] = L;
					rowGreen[L] = (rowGreen[L] || 0) + 1;
				} else if(status === 'yellow'){
					bannedPos[L].add(pos);
					rowYellow[L] = (rowYellow[L] || 0) + 1;
				} else if(status === 'gray'){
					bannedPos[L].add(pos);
					rowGray[L] = (rowGray[L] || 0) + 1;
				}
			}

			// Update global min/max from this row's tallies.
			// Collect all letters seen in this row.
			const allLettersInRow = new Set([
				...Object.keys(rowGreen),
				...Object.keys(rowYellow),
				...Object.keys(rowGray)
			]);
			for(const L of allLettersInRow){
				const g = rowGreen[L] || 0;
				const y = rowYellow[L] || 0;
				const gr = rowGray[L] || 0;
				const nonGray = g + y;

				// minimum: the word must contain at least (green+yellow) copies of L
				if(nonGray > (minCount[L] || 0)){
					minCount[L] = nonGray;
				}

				// If this row has a gray AND at least one green/yellow for the same letter,
				// the gray signals "no more copies beyond these non-gray hits" →
				// exact count = nonGray. Update maxCount to the tightest (lowest) value seen.
				if(gr > 0 && nonGray > 0){
					if(maxCount[L] === undefined || nonGray < maxCount[L]){
						maxCount[L] = nonGray;
					}
				}

				// If the letter is ONLY gray in this row (nonGray === 0),
				// it means the letter is completely absent → maxCount = 0.
				if(gr > 0 && nonGray === 0){
					maxCount[L] = 0;
				}
			}
		}

		function matches(word){
			word = word.toLowerCase();
			if(word.length !== 5) return false;

			// 1. Greens: exact letter at exact position
			for(const p in greens){
				if(word[Number(p)] !== greens[p]) return false;
			}

			// 2. Banned positions: yellow and gray letters must not appear at their banned positions
			for(const L in bannedPos){
				for(const p of bannedPos[L]){
					if(word[p] === L) return false;
				}
			}

			// 3. Letter count constraints
			for(const L in minCount){
				const have = Array.from(word).filter(ch => ch === L).length;
				// minimum: must have at least minCount copies
				if(have < minCount[L]) return false;
				// maximum: if capped (from a double-letter gray row), must not exceed it
				if(maxCount[L] !== undefined && have > maxCount[L]) return false;
			}

			return true;
		}

		return source.filter(matches);
	}

	function showResults(list){
		if(numPos) numPos.textContent = list.length;
		if(!list || list.length === 0){
			ansPos.textContent = 'No possible matches';
			return;
		}
		// show words in uppercase, one per line
		ansPos.textContent = list.map(w => (w || '').toUpperCase()).join('\n');
	}

	// Wire update and print (buttons may not exist if HTML minimal)
	const updateBtnDom = document.getElementById('update');
	if(updateBtnDom) updateBtnDom.addEventListener('click', () => {
		// compute and store results, show only the count
		const results = computeCandidates();
		lastResults = results;
		if(numPos) numPos.textContent = results.length;
		if(ansPos) ansPos.innerHTML = '&nbsp;';
	});

	const printBtnDom = document.getElementById('print');
	if(printBtnDom) printBtnDom.addEventListener('click', () => {
		// use stored results when available
		const results = (lastResults !== null) ? lastResults : computeCandidates();
		lastResults = results;
		// render results into the page (plain uppercase text)
		showResults(results);
	});

	// ── Global keydown: handle letter presses when no tile is focused ────────
	// If focus is outside the grid entirely, redirect the letter to the first
	// empty cell of the last (bottom-most) unlocked row.
	document.addEventListener('keydown', (e) => {
		if(e.key.length !== 1 || !/^[a-zA-Z]$/.test(e.key)) return;
		if(e.ctrlKey || e.metaKey || e.altKey) return;
		// only act when the focused element is NOT already a grid tile
		if(document.activeElement && document.activeElement.classList.contains('grid-tile')) return;
		// find the last row that still has at least one empty tile
		const allRows = Array.from(grid.querySelectorAll('.row-grid'));
		let targetRow = null;
		for(let i = allRows.length - 1; i >= 0; i--){
			const tiles = Array.from(allRows[i].querySelectorAll('.grid-tile'));
			if(tiles.some(tile => !(tile.value || '').trim() && !tile.disabled)){
				targetRow = allRows[i];
				break;
			}
		}
		if(!targetRow) return;
		const tiles = Array.from(targetRow.querySelectorAll('.grid-tile'));
		const firstEmpty = tiles.find(tile => !(tile.value || '').trim() && !tile.disabled);
		if(!firstEmpty) return;
		e.preventDefault();
		firstEmpty.value = e.key.toUpperCase();
		const col = Number(firstEmpty.dataset.col);
		const L = firstEmpty.value.toLowerCase();
		const inferred = inferStatusForLetter(L, col);
		if(inferred) setTileStatus(firstEmpty, inferred); else setTileStatus(firstEmpty, 'gray');
		firstEmpty.focus();
	});

	// create initial rows (1 by default) — always keep one extra row after Enter
	const DEFAULT_ROWS = 1;
	for(let r=0;r<DEFAULT_ROWS;r++) addRow();

});


