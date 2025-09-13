/**
 * PSD Grading Tool - Main JavaScript
 * Handles file processing, grading logic, and UI interactions
 */

// Global variables
let uploadedFiles = [];
let processedResults = [];

// API endpoint
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/api';

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎨 PSD Grading Tool initialized');
    
    // Initialize all components
    initializeServerStatus();
    initializeFileUpload();
    initializePatternSelector();
    initializeSliders(); // Updated smart sliders
    initializeColorModeRadios(); // New radio buttons
    initializeCollapsibleSections();
    initializeProcessButton();
    
    // Add input listeners for filename help text
    updatePatternHelp();
});

/**
 * Check server status
 */
function initializeServerStatus() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    // Check server status
    fetch(`${API_URL}/health`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'ok') {
                statusDot.classList.add('status-online');
                statusText.textContent = 'Server Online';
            } else {
                throw new Error('Server not responding correctly');
            }
        })
        .catch(error => {
            console.error('Server status check failed:', error);
            statusDot.classList.add('status-offline');
            statusText.textContent = 'Server Offline';
            showToast('Server connection failed. Some features may not work.', 'error');
        });
}

/**
 * Initialize file upload functionality
 */
function initializeFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    
    // Click to upload
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
}

/**
 * Handle file selection
 */
function handleFiles(files) {
    const validFiles = [];
    const fileListDiv = document.getElementById('fileList');
    
    for (let file of files) {
        if (window.PSDUtils.FileValidator.isValidFile(file)) {
            if (window.PSDUtils.FileValidator.isFileTooLarge(file, 500)) {
                showToast(`${file.name} is too large (max 500MB)`, 'warning');
            } else {
                validFiles.push(file);
            }
        } else {
            showToast(`${file.name} is not a valid PSD or ZIP file`, 'warning');
        }
    }
    
    if (validFiles.length > 0) {
        uploadedFiles = validFiles;
        displayFileList();
        document.getElementById('uploadArea').classList.add('has-files');
    }
}

/**
 * Display uploaded files
 */
function displayFileList() {
    const fileListDiv = document.getElementById('fileList');
    
    if (uploadedFiles.length === 0) {
        fileListDiv.style.display = 'none';
        return;
    }
    
    fileListDiv.style.display = 'block';
    fileListDiv.innerHTML = `
        <h4>📁 Uploaded Files (${uploadedFiles.length})</h4>
        ${uploadedFiles.map((file, index) => `
            <div class="file-item">
                <span class="file-icon">📄</span>
                <span>${file.name}</span>
                <span style="margin-left: auto; color: #6b7280; font-size: 0.85rem;">
                    ${window.PSDUtils.UIUtils.formatFileSize(file.size)}
                </span>
            </div>
        `).join('')}
    `;
}

/**
 * Initialize pattern selector
 */
function initializePatternSelector() {
    const patternType = document.getElementById('filenamePatternType');
    const patternInput = document.getElementById('filenamePattern');
    
    patternType.addEventListener('change', () => {
        updatePatternHelp();
        
        // Set appropriate pattern based on selection
        switch(patternType.value) {
            case 'class_name_assignment':
                patternInput.value = '{CLASS}_{LASTNAME}_{ASSIGNMENT}';
                break;
            case 'name_class_assignment':
                patternInput.value = '{LASTNAME}_{CLASS}_{ASSIGNMENT}';
                break;
            case 'assignment_name_class':
                patternInput.value = '{ASSIGNMENT}_{LASTNAME}_{CLASS}';
                break;
            case 'exact':
                patternInput.value = '';
                patternInput.placeholder = 'Enter exact filename (without .psd)';
                break;
            case 'contains':
                patternInput.value = '';
                patternInput.placeholder = 'Enter text that must be in filename';
                break;
            case 'regex':
                patternInput.value = '';
                patternInput.placeholder = 'Enter regular expression pattern';
                break;
            case 'custom':
                patternInput.value = '';
                patternInput.placeholder = 'e.g., {CLASS}_{LASTNAME}_{ASSIGNMENT}';
                break;
        }
    });
}

/**
 * Update pattern help text
 */
function updatePatternHelp() {
    const patternType = document.getElementById('filenamePatternType').value;
    const patternHelp = document.getElementById('patternHelp');
    const example = window.PSDUtils.FilenamePatterns.getPatternExample(
        document.getElementById('filenamePattern').value,
        patternType
    );
    
    let helpText = '';
    switch(patternType) {
        case 'custom':
            helpText = 'Available placeholders: {CLASS}, {LASTNAME}, {FIRSTNAME}, {ASSIGNMENT}, {NUMBER}, {ANY}';
            break;
        case 'exact':
            helpText = 'Filename must match exactly (without extension)';
            break;
        case 'contains':
            helpText = 'Filename must contain this text';
            break;
        case 'regex':
            helpText = 'Use JavaScript regular expression syntax';
            break;
        default:
            helpText = `Pattern: ${document.getElementById('filenamePattern').value}`;
    }
    
    patternHelp.innerHTML = `${helpText}<br>Example: ${example}`;
}

/**
 * Initialize smart sliders with sticky notch points
 */
function initializeSliders() {
    // Define slider configurations with notch points
    const sliderConfigs = [
        { 
            input: 'filenamePoints', 
            slider: 'filenamePointsSlider', 
            min: 0, 
            max: 50,  // Correct max value
            notches: [0, 10, 20, 30, 40, 50],  // Snap to 10s
            snapTolerance: 3,
            forceSnap: true  // Always snap to notches
        },
        { 
            input: 'reqWidth', 
            slider: 'reqWidthSlider', 
            min: 0, 
            max: 7680, // Max matches last notch so slider reaches the end
            notches: [0, 640, 800, 1024, 1280, 1366, 1440, 1600, 1920, 2560, 3840, 5120, 7680],
            snapTolerance: 50,
            forceSnap: true  // Snap to preset values
        },
        { 
            input: 'reqHeight', 
            slider: 'reqHeightSlider', 
            min: 0, 
            max: 4320, // Max matches last notch so slider reaches the end
            notches: [0, 480, 600, 720, 768, 900, 1080, 1200, 1440, 1600, 2160, 2880, 4320],
            snapTolerance: 50,
            forceSnap: true  // Snap to preset values
        },
        { 
            input: 'minLayers', 
            slider: 'minLayersSlider', 
            min: 1,  // Min is 1
            max: 5,  // Max is 5
            notches: [1, 2, 3, 4, 5],
            snapTolerance: 0.3,
            forceSnap: true // Always snap for small ranges
        },
        { 
            input: 'pointsPerCriterion', 
            slider: 'pointsPerCriterionSlider', 
            min: 0, 
            max: 50,  // Correct max value
            notches: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
            snapTolerance: 3,
            forceSnap: true  // Snap to notches
        }
    ];

const additionalSliderConfigs = [
    // Resolution slider
    { 
        input: 'reqResolution', 
        slider: 'reqResolutionSlider', 
        min: 72, 
        max: 600, // Max matches last notch
        notches: [72, 96, 150, 200, 250, 300, 400, 600],
        snapTolerance: 10,
        forceSnap: true  // Snap to preset DPI values
    },
    // Font points slider
    { 
        input: 'fontPoints', 
        slider: 'fontPointsSlider', 
        min: 0, 
        max: 50,  // Correct max value
        notches: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
        snapTolerance: 3,
        forceSnap: true  // Snap to notches
    }
];

// Combine the configs and process them
const allConfigs = sliderConfigs.concat(additionalSliderConfigs);
allConfigs.forEach(config => {
    const input = document.getElementById(config.input);
    const slider = document.getElementById(config.slider);


        if (input && slider) {
            // Set slider attributes
            slider.min = config.min;
            slider.max = config.max;
            
            // Create tick marks for notches
            if (config.notches) {
                createTickMarks(slider, config);
            }

            // Set initial values
            const initialValue = input.value || 0;
            slider.value = initialValue;

            // SIMPLE APPROACH - No interference with typing
            
            // 1. Slider changes update input (with snapping)
            slider.addEventListener('input', (e) => {
                let value = parseFloat(e.target.value);
                
                // Snap to notch when using slider
                if (config.notches) {
                    value = snapToNotch(value, config);
                }
                
                input.value = value;
                updateSliderLabel(slider, value, config);
            });

            // 2. Input changes update slider (NO snapping, free typing)
            input.addEventListener('change', (e) => {
                // Only update on change (when user finishes typing)
                let value = parseFloat(e.target.value);
                
                if (isNaN(value)) {
                    value = config.min;
                }
                
                // Clamp to range but DON'T snap
                value = Math.max(config.min, Math.min(config.max, value));
                
                // Update the displayed value
                e.target.value = value;
                slider.value = value;
                updateSliderLabel(slider, value, config);
            });
            
            // 3. Remove any 'input' event on text field that might interfere
            // Just let the user type freely
            
            // 4. Optional: Update slider position while typing (visual only)
            input.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value)) {
                    // Update slider position visually but don't change input value
                    slider.value = Math.max(config.min, Math.min(config.max, value));
                }
            });

            // Initialize label
            updateSliderLabel(slider, initialValue, config);
        }
    });
}

/**
 * Snap value to nearest notch point
 */
function snapToNotch(value, config) {
    if (!config.notches || config.forceSnap === false) return value;
    
    const numValue = parseFloat(value);
    let closestNotch = config.notches[0];
    let closestDistance = Math.abs(numValue - closestNotch);
    
    for (const notch of config.notches) {
        const distance = Math.abs(numValue - notch);
        if (distance < closestDistance) {
            closestNotch = notch;
            closestDistance = distance;
        }
    }
    
    // Snap if within tolerance
    const tolerance = config.snapTolerance || (config.max - config.min) * 0.02;
    if (closestDistance <= tolerance || config.forceSnap) {
        return closestNotch;
    }
    
    return numValue;
}

/**
 * Create visual tick marks for notch points
 */
function createTickMarks(slider, config) {
    // Remove existing tick container if any
    const existingTicks = slider.parentElement.querySelector('.slider-ticks');
    if (existingTicks) existingTicks.remove();
    
    // Create tick container
    const tickContainer = document.createElement('div');
    tickContainer.className = 'slider-ticks';
    
    config.notches.forEach(notch => {
        const tick = document.createElement('div');
        tick.className = 'slider-tick';
        const percentage = ((notch - config.min) / (config.max - config.min)) * 100;
        tick.style.left = percentage + '%';
        
        // Add label for certain values
        if (config.labels && config.labels[notch]) {
            tick.setAttribute('data-label', config.labels[notch]);
            tick.classList.add('has-label');
        }
        
        tickContainer.appendChild(tick);
    });
    
    // Insert after slider
    slider.parentElement.insertBefore(tickContainer, slider.nextSibling);
}

/**
 * Convert color mode dropdown to radio buttons
 */
function initializeColorModeRadios() {
    const colorModeSelect = document.getElementById('reqColorMode');
    if (!colorModeSelect) return;
    
    // Create radio button group
    const radioGroup = document.createElement('div');
    radioGroup.className = 'color-mode-radios';
    radioGroup.innerHTML = `
        <label class="radio-option">
            <input type="radio" name="colorMode" value="" checked>
            <span class="radio-custom"></span>
            <span class="radio-label">Any</span>
        </label>
        <label class="radio-option">
            <input type="radio" name="colorMode" value="RGB">
            <span class="radio-custom"></span>
            <span class="radio-label">RGB</span>
        </label>
        <label class="radio-option">
            <input type="radio" name="colorMode" value="CMYK">
            <span class="radio-custom"></span>
            <span class="radio-label">CMYK</span>
        </label>
        <label class="radio-option">
            <input type="radio" name="colorMode" value="Grayscale">
            <span class="radio-custom"></span>
            <span class="radio-label">Grayscale</span>
        </label>
    `;
    
    // Replace select with radio group
    colorModeSelect.style.display = 'none';
    colorModeSelect.parentElement.appendChild(radioGroup);
    
    // Sync radio buttons with hidden select
    radioGroup.addEventListener('change', (e) => {
        if (e.target.type === 'radio') {
            colorModeSelect.value = e.target.value;
        }
    });
    
    // Set initial value
    const initialValue = colorModeSelect.value || '';
    const initialRadio = radioGroup.querySelector(`input[value="${initialValue}"]`);
    if (initialRadio) initialRadio.checked = true;
}

/**
 * Initialize collapsible sections with checkboxes
 */
function initializeCollapsibleSections() {
    // Define sections with their configurations
    const sections = [
        {
            checkboxId: 'enableFilenameSection',
            sectionId: 'filenameSection',
            defaultChecked: true
        },
        {
            checkboxId: 'enableTechnicalSection',
            sectionId: 'technicalSection',
            defaultChecked: true
        },
        {
            checkboxId: 'enableFerpaSection',
            sectionId: 'ferpaSection',
            defaultChecked: false
        },
        {
            checkboxId: 'enableCanvasSection',
            sectionId: 'canvasSection',
            defaultChecked: false
        }
,
        {
    checkboxId: 'enableFontsSection',
    sectionId: 'fontsSection',
    defaultChecked: false
}

    ];

    const additionalSection = {
    checkboxId: 'enableFontsSection',
    sectionId: 'fontsSection',
    defaultChecked: false
};

    sections.forEach(config => {
        const checkbox = document.getElementById(config.checkboxId);
        const section = document.getElementById(config.sectionId);
        const header = section?.querySelector('.collapsible-header');

        if (checkbox && section && header) {
            // Set initial state
            checkbox.checked = config.defaultChecked;
            if (!config.defaultChecked) {
                section.classList.add('collapsed');
            }

            // Handle checkbox change
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    section.classList.remove('collapsed');
                } else {
                    section.classList.add('collapsed');
                }
            });

            // Handle header click (toggle checkbox and section)
            header.addEventListener('click', (e) => {
                // Don't toggle if clicking directly on the checkbox
                if (e.target.type !== 'checkbox') {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        }
    });
}

/**
 * Get color mode value from either select or radio buttons
 */
function getColorModeValue() {
    // First try to get from radio buttons
    const checkedRadio = document.querySelector('input[name="colorMode"]:checked');
    if (checkedRadio) {
        return checkedRadio.value;
    }
    
    // Fall back to select element
    const selectElement = document.getElementById('reqColorMode');
    return selectElement?.value || '';
}

/**
 * Get enabled criteria for processing
 */
function getEnabledCriteria() {
    const criteria = {
        filename: {
            enabled: document.getElementById('enableFilenameSection')?.checked || false,
            pattern: document.getElementById('filenamePattern')?.value || '',
            patternType: document.getElementById('filenamePatternType')?.value || 'custom',
            points: parseInt(document.getElementById('filenamePoints')?.value) || 0,
            caseSensitive: document.getElementById('filenameCaseSensitive')?.value === 'yes'
        },
        technical: {
            enabled: document.getElementById('enableTechnicalSection')?.checked || false,
            width: document.getElementById('reqWidth')?.value ? parseInt(document.getElementById('reqWidth').value) : null,
            height: document.getElementById('reqHeight')?.value ? parseInt(document.getElementById('reqHeight').value) : null,
            colorMode: getColorModeValue(),
            minLayers: document.getElementById('minLayers')?.value ? parseInt(document.getElementById('minLayers').value) : null,
            requiredLayers: document.getElementById('reqLayers')?.value.split(',').map(l => l.trim()).filter(l => l),
            resolution: document.getElementById('reqResolution')?.value ? parseInt(document.getElementById('reqResolution').value) : null, // NEW
            pointsPerCriterion: parseInt(document.getElementById('pointsPerCriterion')?.value) || 20
        },
        fonts: { // NEW SECTION
            enabled: document.getElementById('enableFontsSection')?.checked || false,
            approvedFonts: document.getElementById('approvedFonts')?.value.split(',').map(f => f.trim()).filter(f => f),
            requiredFonts: document.getElementById('requiredFonts')?.value.split(',').map(f => f.trim()).filter(f => f),
            pointsPerCriterion: parseInt(document.getElementById('fontPoints')?.value) || 20
        },
        ferpa: {
            enabled: document.getElementById('enableFerpaSection')?.checked || false,
            prefix: document.getElementById('anonPrefix')?.value || ''
        },
        canvas: {
            enabled: document.getElementById('enableCanvasSection')?.checked || false,
            assignmentName: document.getElementById('canvasAssignmentName')?.value || '',
            sectionName: document.getElementById('canvasSectionName')?.value || '',
            assignmentId: document.getElementById('canvasAssignmentId')?.value || '',
            studentIdSource: document.getElementById('canvasStudentIdSource')?.value || 'lastname'
        }
    };

    return criteria;
}

/**
 * Initialize process button
 */
function initializeProcessButton() {
    const processButton = document.getElementById('processFiles');
    
    processButton.addEventListener('click', async () => {
        if (uploadedFiles.length === 0) {
            showToast('Please upload PSD or ZIP files first', 'warning');
            return;
        }
        
        const criteria = getEnabledCriteria();
        
        // Validate that at least one criterion is enabled
        if (!criteria.filename.enabled && !criteria.technical.enabled) {
            showToast('Please enable at least one grading criterion', 'warning');
            return;
        }
        
        // Show processing indicator
        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('processingIndicator').style.display = 'block';
        document.getElementById('results').innerHTML = '';
        document.getElementById('summaryStats').innerHTML = '';
        
        processButton.disabled = true;
        processButton.textContent = '⏳ Processing...';
        
        try {
            await processFiles(criteria);
        } catch (error) {
            console.error('Processing error:', error);
            showToast('Error processing files: ' + error.message, 'error');
        } finally {
            processButton.disabled = false;
            processButton.textContent = '🚀 Generate Grade Report';
            document.getElementById('processingIndicator').style.display = 'none';
        }
    });
}

/**
 * Process uploaded files
 */
async function processFiles(criteria) {
    const formData = new FormData();
    
    // Add files to form data
    uploadedFiles.forEach(file => {
        formData.append('files', file);
    });
    
    // Add criteria to form data
    formData.append('criteria', JSON.stringify(criteria));
    
    try {
        const response = await fetch(`${API_URL}/process`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}`);
        }
        
        const results = await response.json();
        processedResults = results.files || [];
        
        displayResults(results, criteria);
        showToast(`Successfully processed ${processedResults.length} files`, 'success');
        
    } catch (error) {
        console.error('Processing error:', error);
        throw error;
    }
}

/**
 * Display processing results
 */
function displayResults(results, criteria) {
    // Display summary statistics
    displaySummaryStats(results);
    
    // Display detailed results table
    displayResultsTable(results, criteria);
    
    // Show Canvas instructions if enabled
    if (criteria.canvas.enabled) {
        document.getElementById('canvasInstructions').style.display = 'block';
    } else {
        document.getElementById('canvasInstructions').style.display = 'none';
    }
}

/**
 * Display summary statistics
 */
function displaySummaryStats(results) {
    const stats = results.summary || {};
    const summaryDiv = document.getElementById('summaryStats');
    
    summaryDiv.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${stats.totalFiles || 0}</div>
            <div class="stat-label">Files Processed</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.averageScore || 0}%</div>
            <div class="stat-label">Average Score</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.passed || 0}</div>
            <div class="stat-label">Passed (≥70%)</div>
        </div>
        <div class="stat-card" title="Files scoring below 70% that may need instructor review">
            <div class="stat-number">${stats.failed || 0}</div>
            <div class="stat-label">Below 70%</div>
        </div>
    `;
}

/**
 * Display results table
 */
function displayResultsTable(results, criteria) {
    const resultsDiv = document.getElementById('results');
    const files = results.files || [];
    
    if (files.length === 0) {
        resultsDiv.innerHTML = '<p style="text-align: center; color: #6b7280;">No files processed</p>';
        return;
    }
    
    // Create download buttons
    const downloadButtons = `
        <div style="margin-bottom: 20px; text-align: right;">
            <button class="download-results" onclick="downloadCSV()">
                📥 Download Results CSV
            </button>
            ${criteria.canvas.enabled ? `
                <button class="download-canvas" onclick="downloadCanvasCSV()">
                    🎓 Download for Canvas
                </button>
            ` : ''}
        </div>
    `;
    
    // Create results table
    const table = `
        <table class="results-table">
            <thead>
                <tr>
                    <th>Student File</th>
                    <th>Score</th>
                    <th>Details</th>
                </tr>
            </thead>
            <tbody>
                ${files.map(file => createResultRow(file, criteria)).join('')}
            </tbody>
        </table>
    `;
    
    resultsDiv.innerHTML = downloadButtons + table;
}

/**
 * Create a result row for the table
 */
function createResultRow(file, criteria) {
    const percentage = window.PSDUtils.ScoreUtils.calculatePercentage(file.score, file.maxScore);
    const colorClass = window.PSDUtils.ScoreUtils.getScoreColorClass(percentage);
    
    // Build details HTML
    let details = '<div class="details-cell">';
    
    // Show Canvas metadata if available
    if (file.canvasData) {
        // Show late submission warning
        if (file.isLate) {
            details += `
                <div class="detail-row" style="background: #fef3c7; border-left: 3px solid #f59e0b;">
                    <span class="detail-label">⚠️ Submission:</span>
                    <span class="detail-value" style="color: #d97706; font-weight: 600;">
                        LATE
                    </span>
                </div>
            `;
        }
        
        // Show Canvas User ID
        details += `
            <div class="detail-row">
                <span class="detail-label">Canvas ID:</span>
                <span class="detail-value" style="font-family: monospace; font-size: 0.85rem;">
                    ${file.canvasData.userId}
                </span>
            </div>
        `;
        
        // Show original filename that student submitted
        details += `
            <div class="detail-row">
                <span class="detail-label">Student's file:</span>
                <span class="detail-value" style="font-style: italic;">
                    ${file.canvasData.originalFilename}
                </span>
            </div>
        `;
    }
    
    // Filename check with descriptive text
    if (criteria.filename.enabled && file.criteria?.filename) {
        const filenameCheck = file.criteria.filename;
        details += `
            <div class="detail-row">
                <span class="detail-label">Filename:</span>
                <span class="detail-value">
                    ${filenameCheck.valid ? 
                        '<span class="status-indicator status-pass">✓</span> Matches pattern' : 
                        '<span class="status-indicator status-fail">✗</span> Fails pattern match'}
                </span>
            </div>
        `;
    }
    
    // [Rest of your existing detail rows code...]
    
    details += '</div>';
    
    // Build the row - show student name from Canvas if available
    const displayName = file.canvasData ? 
        `${file.canvasData.studentName} (${file.canvasData.originalFilename})` : 
        (file.displayName || file.filename);
    
    return `
        <tr class="${file.isLate ? 'late-submission' : ''}">
            <td>
                <div class="file-info-cell">
                    <span class="filename">${displayName}</span>
                </div>
            </td>
            <td>
                <div class="score-prominent">
                    <div class="score-percentage ${colorClass}">${percentage}%</div>
                    <div class="score-details">${file.score}/${file.maxScore} pts</div>
                </div>
            </td>
            <td>${details}</td>
        </tr>
    `;
}

/**
 * Download results as CSV
 */
function downloadCSV() {
    if (processedResults.length === 0) {
        showToast('No results to download', 'warning');
        return;
    }
    
    // Create CSV content
    const headers = ['Filename', 'Score', 'Percentage', 'Letter Grade', 'Status'];
    const rows = processedResults.map(file => {
        const percentage = window.PSDUtils.ScoreUtils.calculatePercentage(file.score, file.maxScore);
        const letterGrade = window.PSDUtils.ScoreUtils.getLetterGrade(percentage);
        const status = percentage >= 70 ? 'Pass' : 'Needs Review';
        
        return [
            file.filename,
            file.score,
            percentage + '%',
            letterGrade,
            status
        ];
    });
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Download file
    downloadFile(csvContent, 'grading_results.csv', 'text/csv');
}

/**
 * Download Canvas-formatted CSV
 */
function downloadCanvasCSV() {
    if (processedResults.length === 0) {
        showToast('No results to download', 'warning');
        return;
    }
    
    const criteria = getEnabledCriteria();
    const assignmentName = criteria.canvas.assignmentName || 'Assignment';
    
    // Create Canvas CSV format with user IDs
    const headers = ['Student', 'ID', 'SIS User ID', 'SIS Login ID', assignmentName];
    const rows = processedResults.map(file => {
        const percentage = window.PSDUtils.ScoreUtils.calculatePercentage(file.score, file.maxScore);
        
        if (file.canvasData) {
            // Use Canvas user ID for perfect matching
            return [
                file.canvasData.studentName,     // Student column
                file.canvasData.userId,           // ID column (Canvas User ID)
                '',                               // SIS User ID (leave blank)
                '',                               // SIS Login ID (leave blank)
                percentage                        // Grade
            ];
        } else {
            // Fallback for non-Canvas files
            let studentId = file.filename.replace(/\.psd$/i, '');
            if (file.studentName) {
                studentId = file.studentName;
            }
            
            return [
                studentId,                        // Student column
                '',                               // ID column (no Canvas ID)
                '',                               // SIS User ID
                '',                               // SIS Login ID
                percentage                        // Grade
            ];
        }
    });
    
    // Check for late submissions
    const lateCount = processedResults.filter(r => r.isLate).length;
    if (lateCount > 0) {
        showToast(`Note: ${lateCount} late submissions detected. Apply late penalties in Canvas.`, 'warning', 5000);
    }
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Download file
    const filename = `canvas_import_${assignmentName.replace(/\s+/g, '_').toLowerCase()}.csv`;
    downloadFile(csvContent, filename, 'text/csv');
    
    showToast('Canvas CSV ready! The User IDs will auto-match in Canvas.', 'success', 5000);
}

/**
 * Download file utility
 */
function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => container.removeChild(toast), 300);
    }, duration);
}

// Slider binding helper function
function bindSlider(inputId, sliderId, labelId, showOnZero = false, notchValues = null) {
    const input = document.getElementById(inputId);
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    
    if (!input || !slider) return;
    
    // Define notch values for each slider
    const notches = notchValues || getNotchesForSlider(inputId);
    const shouldSnap = slider.classList.contains('has-notches') || notches !== null;
    
    // Function to snap value to nearest notch
    const snapToNotch = (value) => {
        if (!notches || !shouldSnap) return value;
        
        const numValue = parseFloat(value);
        let closestNotch = notches[0];
        let closestDistance = Math.abs(numValue - closestNotch);
        
        for (const notch of notches) {
            const distance = Math.abs(numValue - notch);
            if (distance < closestDistance) {
                closestNotch = notch;
                closestDistance = distance;
            }
        }
        
        return closestNotch;
    };
    
    // Function to check if value is at a notch
    const isAtNotch = (value) => {
        if (!notches) return true; // If no notches defined, always show
        const numValue = parseFloat(value);
        return notches.includes(numValue);
    };
    
    // Function to update label position and visibility
    const updateLabel = (value, forceShow = false) => {
        if (!label) return;
        
        const numValue = parseFloat(value);
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        
        // Calculate position percentage
        let percentage = ((numValue - min) / (max - min)) * 100;
        
        // Apply edge padding to prevent pill overflow
        // Clamp between 5% and 95% to keep pills fully visible
        const minPercent = 5;
        const maxPercent = 95;
        
        if (percentage < minPercent) {
            percentage = minPercent;
        } else if (percentage > maxPercent) {
            percentage = maxPercent;
        }
        
        // Position the label at the calculated position
        label.style.left = `${percentage}%`;
        label.textContent = numValue;
        
        // Show label at notch values or when forced
        if (forceShow || showOnZero || (isAtNotch(numValue) && numValue >= min)) {
            label.classList.add('visible');
        } else {
            label.classList.remove('visible');
        }
    };
    
    // Sync input to slider (no snapping on manual input)
    input.addEventListener('input', (e) => {
        let value = parseFloat(e.target.value) || 0;
        // Clamp to range but don't snap
        value = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), value));
        slider.value = value;
        updateLabel(value, true); // Force show when typing
    });
    
    // When input loses focus, optionally snap to notch
    input.addEventListener('blur', (e) => {
        if (shouldSnap) {
            const value = snapToNotch(e.target.value);
            e.target.value = value;
            slider.value = value;
            updateLabel(value);
        }
    });
    
    // Sync slider to input (with snapping)
    slider.addEventListener('input', (e) => {
        let value = parseFloat(e.target.value);
        
        if (shouldSnap) {
            value = snapToNotch(value);
        }
        
        input.value = value;
        slider.value = value; // Update slider position to snapped value
        updateLabel(value);
    });
    
    // Initialize
    const initialValue = input.value || slider.value || slider.min;
    input.value = initialValue;
    slider.value = initialValue;
    updateLabel(initialValue);
}

// Helper function to get notch values for each slider
function getNotchesForSlider(inputId) {
    const notchMap = {
        'filenamePoints': [0, 10, 20, 30, 40, 50], // Snap to 10s
        'reqWidth': [0, 640, 800, 1024, 1280, 1366, 1440, 1600, 1920, 2560, 3840, 5120, 7680], // Common resolutions
        'reqHeight': [0, 480, 600, 720, 768, 900, 1080, 1200, 1440, 1600, 2160, 2880, 4320], // Common resolutions
        'minLayers': [1, 2, 3, 4, 5], // 1-5 range
        'pointsPerCriterion': [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50], // Every 5
        'reqResolution': [72, 96, 150, 200, 250, 300, 400, 600], // Common DPI values
        'fontPoints': [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50] // Every 5
    };
    
    return notchMap[inputId] || null;
}

// Helper function to get notch values for each slider
function getNotchesForSlider(inputId) {
    const notchMap = {
        'filenamePoints': [0, 10, 20, 30, 40, 50], // Snap to 10s
        'reqWidth': [0, 640, 800, 1024, 1280, 1366, 1440, 1600, 1920, 2560, 3840, 5120, 7680], // Common resolutions
        'reqHeight': [0, 480, 600, 720, 768, 900, 1080, 1200, 1440, 1600, 2160, 2880, 4320], // Common resolutions
        'minLayers': [1, 2, 3, 4, 5], // 1-5 range
        'pointsPerCriterion': [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50], // Every 5
        'reqResolution': [72, 96, 150, 200, 250, 300, 400, 600], // Common DPI values
        'fontPoints': [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50] // Every 5
    };
    
    return notchMap[inputId] || null;
}

// Helper function to get notch values for each slider
function getNotchesForSlider(inputId) {
    const notchMap = {
        'filenamePoints': [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
        'reqWidth': [0, 640, 800, 1024, 1280, 1366, 1440, 1600, 1920, 2560, 3840, 5120, 7680],
        'reqHeight': [0, 480, 600, 720, 768, 900, 1080, 1200, 1440, 1600, 2160, 2880, 4320],
        'minLayers': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100],
        'pointsPerCriterion': [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
        'reqResolution': [72, 96, 150, 200, 250, 300, 400, 500, 600],
        'fontPoints': [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
    };
    
    return notchMap[inputId] || null;
}

// Initialize all slider bindings when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    
    // Filename points slider (always shows label at notches, snaps to 10s)
    bindSlider('filenamePoints', 'filenamePointsSlider', 'filenamePointsLabel', true);
    
    // Width and Height sliders (snap to preset values, show labels at notches)
    bindSlider('reqWidth', 'reqWidthSlider', 'reqWidthLabel', false);
    bindSlider('reqHeight', 'reqHeightSlider', 'reqHeightLabel', false);
    
    // Minimum layers slider (1-5 range, show at all values)
    bindSlider('minLayers', 'minLayersSlider', 'minLayersLabel', true);
    
    // Points per criterion slider (shows label at notches)
    bindSlider('pointsPerCriterion', 'pointsPerCriterionSlider', 'pointsPerCriterionLabel', true);
    
    // Resolution slider (snap to preset DPI values)
    bindSlider('reqResolution', 'reqResolutionSlider', 'reqResolutionLabel', false);
    
    // Font points slider (shows label at notches)
    bindSlider('fontPoints', 'fontPointsSlider', 'fontPointsLabel', true);
    
    // Color mode radio buttons
    const colorModeRadios = document.querySelectorAll('input[name="colorMode"]');
    colorModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const selectedColorMode = e.target.value;
            document.body.dataset.selectedColorMode = selectedColorMode;
        });
    });
    
    // Function to get selected color mode
    window.getSelectedColorMode = () => {
        const checked = document.querySelector('input[name="colorMode"]:checked');
        return checked ? checked.value : '';
    };
});

// Make functions available globally for onclick handlers
window.downloadCSV = downloadCSV;
window.downloadCanvasCSV = downloadCanvasCSV;
