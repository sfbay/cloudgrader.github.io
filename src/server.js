/**
 * PSD Grading Tool - Server
 * Updated version with layer fixes, resolution, and font checking
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { createCanvas, Image } = require('canvas');
const psd = require('ag-psd');
const PSD = require('psd');
const JSZip = require('jszip');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize canvas for ag-psd
psd.initializeCanvas(
    (width, height) => {
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        return { canvas, context };
    },
    (canvas) => canvas.toBuffer()
);

// Middleware
app.use(cors());
app.use(express.json());

const staticPath = path.join(__dirname, 'public');
console.log('📁 Static files directory:', staticPath);

// Serve static files from src/public
app.use(express.static(staticPath));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Process files endpoint
app.post('/api/process', upload.array('files', 100), async (req, res) => {
    try {
        const files = req.files;
        const criteria = JSON.parse(req.body.criteria || '{}');
        
        console.log(`📁 Processing ${files.length} files...`);
        console.log('📋 Criteria:', JSON.stringify(criteria, null, 2));
        
        const results = {
            files: [],
            summary: {
                totalFiles: 0,
                averageScore: 0,
                passed: 0,
                failed: 0
            }
        };
        
        // Process each file
        for (const file of files) {
            let fileResults = [];
            
            if (file.originalname.toLowerCase().endsWith('.zip')) {
                // Handle ZIP files
                fileResults = await processZipFile(file, criteria);
            } else if (file.originalname.toLowerCase().endsWith('.psd')) {
                // Handle single PSD file
                const result = await processPSDFile(file, criteria);
                fileResults.push(result);
            }
            
            results.files.push(...fileResults);
        }
        
        // Calculate summary statistics
        results.summary.totalFiles = results.files.length;
        if (results.files.length > 0) {
            const validFiles = results.files.filter(f => f.maxScore > 0);
            if (validFiles.length > 0) {
                const totalScore = validFiles.reduce((sum, f) => sum + f.score, 0);
                const totalMaxScore = validFiles.reduce((sum, f) => sum + f.maxScore, 0);
                results.summary.averageScore = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
            }
            
            results.files.forEach(file => {
                if (file.maxScore > 0) {
                    const percentage = (file.score / file.maxScore) * 100;
                    if (percentage >= 70) {
                        results.summary.passed++;
                    } else {
                        results.summary.failed++;
                    }
                }
            });
        }
        
        console.log(`✅ Processing complete`);
        res.json(results);
        
    } catch (error) {
        console.error('❌ Processing error:', error);
        res.status(500).json({ 
            error: 'Failed to process files', 
            message: error.message 
        });
    }
});

// Process ZIP file
async function processZipFile(file, criteria) {
    const results = [];
    
    try {
        const zip = await JSZip.loadAsync(file.buffer);
        const psdFiles = Object.keys(zip.files).filter(name => 
            name.toLowerCase().endsWith('.psd') && 
            !name.includes('__MACOSX') &&
            !name.startsWith('.')
        );
        
        for (const psdName of psdFiles) {
            const psdData = await zip.files[psdName].async('nodebuffer');
            const result = await processPSDFile({
                buffer: psdData,
                originalname: path.basename(psdName)
            }, criteria);
            results.push(result);
        }
    } catch (error) {
        console.error('Error processing ZIP:', error);
    }
    
    return results;
}

// Process PSD file
async function processPSDFileCanvas(file, criteria) {
    const result = {
        filename: file.originalname,
        displayName: file.originalname,
        score: 0,
        maxScore: 0,
        criteria: {},
        thumbnail: null,
        canvasData: null // NEW: Store Canvas metadata
    };
    
    // Try to parse Canvas filename format
    const canvasInfo = parseCanvasFilename(file.originalname);
    
    if (canvasInfo) {
        result.canvasData = canvasInfo;
        result.displayName = `${canvasInfo.lastName} - ${canvasInfo.originalFilename}`;
        result.studentName = canvasInfo.lastName;
        result.canvasUserId = canvasInfo.userId;
        result.isLate = canvasInfo.isLate;
        
        // For filename checking, use the ORIGINAL filename that student submitted
        file.originalFilenameForChecking = canvasInfo.originalFilename + '.psd';
        
        console.log(`📚 Canvas submission from ${canvasInfo.studentName} (ID: ${canvasInfo.userId})`);
        if (canvasInfo.isLate) {
            console.log(`  ⚠️ Late submission`);
        }
    } else {
        // Not a Canvas filename, use as-is
        file.originalFilenameForChecking = file.originalname;
    }
    
    // Continue with rest of processing...
    // [Rest of your existing processPSDFile code, but use file.originalFilenameForChecking for pattern checking]
    
    try {
        let psdData = null;
        let parseError = null;
        
        console.log(`\n🔍 Processing ${file.originalname}...`);
        
        // [Your existing PSD parsing code here...]
        
        // Check filename criteria - use the ORIGINAL student filename
        if (criteria.filename?.enabled) {
            const filenameToCheck = file.originalFilenameForChecking || file.originalname;
            const filenameCheck = checkFilename(filenameToCheck, criteria.filename);
            
            // Add Canvas info to the check result
            if (canvasInfo) {
                filenameCheck.canvasInfo = canvasInfo;
                filenameCheck.displayName = `Original: ${canvasInfo.originalFilename}`;
            }
            
            result.criteria.filename = filenameCheck;
            result.maxScore += criteria.filename.points || 0;
            if (filenameCheck.valid) {
                result.score += criteria.filename.points || 0;
            }
            
            // Extract student name if not from Canvas
            if (!canvasInfo && filenameCheck.studentName) {
                result.studentName = filenameCheck.studentName;
            }
        }
        
        // [Rest of your existing processing code...]
    } catch (error) {
        console.error(`Error processing ${file.originalname}:`, error);
        result.error = error.message;
    }
    
    return result;
}


// Check filename requirements (simplified)
function checkFilename(filename, criteria) {
    const nameWithoutExt = filename.replace(/\.psd$/i, '');
    const result = {
        valid: false,
        message: ''
    };
    
    // Validate pattern
    result.valid = validateFilenamePattern(filename, criteria.pattern, criteria.patternType, criteria.caseSensitive);
    
    // Simplified message - just mark as incorrect
    if (!result.valid) {
        result.message = 'Incorrect';
    }
    
    // Try to extract student name
    if (criteria.pattern && (criteria.pattern.includes('{LASTNAME}') || criteria.patternType.includes('name'))) {
        const match = extractFromPattern(nameWithoutExt, criteria.pattern, criteria.patternType);
        if (match && match.LASTNAME) {
            result.studentName = match.LASTNAME;
        }
    }
    
    return result;
}

// Validate filename pattern
function validateFilenamePattern(filename, pattern, patternType, caseSensitive = false) {
    const nameWithoutExt = filename.replace(/\.psd$/i, '');
    let checkName = caseSensitive ? nameWithoutExt : nameWithoutExt.toLowerCase();
    let checkPattern = caseSensitive ? pattern : pattern.toLowerCase();
    
    console.log(`🔍 Validating: "${nameWithoutExt}" against pattern "${pattern}" (type: ${patternType}, case: ${caseSensitive})`);
    
    // Handle predefined pattern types
    switch(patternType) {
        case 'class_name_assignment':
            pattern = '{CLASS}_{LASTNAME}_{ASSIGNMENT}';
            checkPattern = caseSensitive ? pattern : pattern.toLowerCase();
            return validatePlaceholderPattern(nameWithoutExt, pattern, caseSensitive);
            
        case 'name_class_assignment':
            pattern = '{LASTNAME}_{CLASS}_{ASSIGNMENT}';
            checkPattern = caseSensitive ? pattern : pattern.toLowerCase();
            return validatePlaceholderPattern(nameWithoutExt, pattern, caseSensitive);
            
        case 'assignment_name_class':
            pattern = '{ASSIGNMENT}_{LASTNAME}_{CLASS}';
            checkPattern = caseSensitive ? pattern : pattern.toLowerCase();
            return validatePlaceholderPattern(nameWithoutExt, pattern, caseSensitive);
            
        case 'exact':
            return checkName === checkPattern;
            
        case 'contains':
            return checkName.includes(checkPattern);
            
        case 'regex':
            try {
                const regex = new RegExp(pattern, caseSensitive ? '' : 'i');
                return regex.test(nameWithoutExt);
            } catch(e) {
                console.error('Invalid regex pattern:', e);
                return false;
            }
            
        case 'custom':
        default:
            return validatePlaceholderPattern(nameWithoutExt, pattern, caseSensitive);
    }
}

// Validate placeholder patterns
function validatePlaceholderPattern(filename, pattern, caseSensitive) {
    let checkName = caseSensitive ? filename : filename.toLowerCase();
    let checkPattern = caseSensitive ? pattern : pattern.toLowerCase();
    
    console.log(`📝 Placeholder validation: "${checkName}" vs pattern "${checkPattern}"`);
    
    // Convert pattern to regex
    let regexPattern = checkPattern
        .replace(/[.*+?^${}()|\[\]\\]/g, '\\$&')  // Escape special chars
        .replace(/\\\{class\\\}/gi, '([A-Za-z]{2,5}[\\s\\-]?\\d{2,4})')
        .replace(/\\\{lastname\\\}/gi, '([A-Za-z\\-]+)')
        .replace(/\\\{firstname\\\}/gi, '([A-Za-z\\-]+)')
        .replace(/\\\{assignment\\\}/gi, '([A-Za-z]*[\\s\\-]?\\d+[A-Za-z]?)')
        .replace(/\\\{number\\\}/gi, '(\\d+)')
        .replace(/\\\{any\\\}/gi, '(.+)');
    
    try {
        const regex = new RegExp('^' + regexPattern + '$', caseSensitive ? '' : 'i');
        const matches = checkName.match(regex);
        
        if (matches) {
            console.log(`✅ Pattern match SUCCESS: "${filename}"`);
            return true;
        } else {
            console.log(`❌ Pattern match FAILED: "${filename}"`);
            console.log(`   Expected pattern: ${pattern}`);
            console.log(`   Generated regex: ${regexPattern}`);
        }
        return matches !== null;
    } catch(e) {
        console.error('Pattern error:', e);
        return false;
    }
}

// Extract values from pattern
function extractFromPattern(filename, pattern, patternType) {
    // Convert pattern type to actual pattern if needed
    switch(patternType) {
        case 'class_name_assignment':
            pattern = '{CLASS}_{LASTNAME}_{ASSIGNMENT}';
            break;
        case 'name_class_assignment':
            pattern = '{LASTNAME}_{CLASS}_{ASSIGNMENT}';
            break;
        case 'assignment_name_class':
            pattern = '{ASSIGNMENT}_{LASTNAME}_{CLASS}';
            break;
    }
    
    const placeholders = ['CLASS', 'LASTNAME', 'FIRSTNAME', 'ASSIGNMENT', 'NUMBER'];
    
    // Build regex with named groups
    let regexPattern = pattern;
    placeholders.forEach(placeholder => {
        const placeholderRegex = new RegExp(`\\{${placeholder}\\}`, 'gi');
        let capturePattern = '[^_]+';
        
        switch(placeholder) {
            case 'CLASS':
                capturePattern = '[A-Za-z]{2,5}[\\s\\-]?\\d{2,4}';
                break;
            case 'LASTNAME':
            case 'FIRSTNAME':
                capturePattern = '[A-Za-z\\-]+';
                break;
            case 'ASSIGNMENT':
                capturePattern = '[A-Za-z]*[\\s\\-]?\\d+[A-Za-z]?';
                break;
            case 'NUMBER':
                capturePattern = '\\d+';
                break;
        }
        
        regexPattern = regexPattern.replace(placeholderRegex, `(?<${placeholder}>${capturePattern})`);
    });
    
    try {
        const regex = new RegExp('^' + regexPattern + '$', 'i');
        const match = filename.match(regex);
        if (match && match.groups) {
            return match.groups;
        }
    } catch(e) {
        console.error('Pattern extraction error:', e);
    }
    
    return null;
}

// UPDATED: Check technical requirements with better layer handling
function checkTechnicalRequirements(psdData, criteria) {
    const result = {};
    
    // Check dimensions
    if (criteria.width || criteria.height) {
        result.dimensions = {
            valid: true,
            actual: `${psdData.width}x${psdData.height}px`,
            expected: `${criteria.width || 'any'}x${criteria.height || 'any'}px`
        };
        
        if (criteria.width && psdData.width !== criteria.width) {
            result.dimensions.valid = false;
        }
        if (criteria.height && psdData.height !== criteria.height) {
            result.dimensions.valid = false;
        }
    }
    
    // Check color mode
    if (criteria.colorMode) {
        const colorModeMap = {
            0: 'Bitmap',
            1: 'Grayscale',
            2: 'Indexed',
            3: 'RGB',
            4: 'CMYK',
            7: 'Multichannel',
            8: 'Duotone',
            9: 'Lab'
        };
        
        const actualMode = colorModeMap[psdData.colorMode] || 'Unknown';
        result.colorMode = {
            valid: actualMode === criteria.colorMode || criteria.colorMode === '',
            actual: actualMode,
            expected: criteria.colorMode || 'Any'
        };
    }
    
    // FIXED: Check layer count (include ALL layers, not just visible)
    if (criteria.minLayers !== null && criteria.minLayers !== undefined) {
        const layerCount = countAllLayers(psdData);
        result.layers = {
            valid: layerCount >= criteria.minLayers,
            count: layerCount,
            minimum: criteria.minLayers
        };
    }
    
    // ENHANCED: Check required layers with individual results
    if (criteria.requiredLayers?.length > 0) {
        const layerNames = getAllLayerNames(psdData);
        const requiredLayersDetails = [];
        
        criteria.requiredLayers.forEach(reqLayer => {
            const found = layerNames.some(name => 
                name.toLowerCase().includes(reqLayer.toLowerCase())
            );
            requiredLayersDetails.push({
                name: reqLayer,
                found: found,
                actualMatch: found ? layerNames.find(name => 
                    name.toLowerCase().includes(reqLayer.toLowerCase())
                ) : null
            });
        });
        
        result.requiredLayers = {
            valid: requiredLayersDetails.every(l => l.found),
            details: requiredLayersDetails
        };
        result.requiredLayersDetails = requiredLayersDetails; // For individual scoring
    }
    
    // NEW: Check resolution (DPI)
    if (criteria.resolution) {
        let actualResolution = 72; // default
        
        if (psdData.imageResources?.resolutionInfo) {
            actualResolution = Math.round(
                psdData.imageResources.resolutionInfo.horizontalResolution || 72
            );
        }
        
        result.resolution = {
            valid: actualResolution >= criteria.resolution,
            actual: actualResolution,
            expected: criteria.resolution
        };
    }
    
    return result;
}

// NEW: Check font requirements
function checkFontRequirements(psdData, criteria) {
    const result = {
        valid: true,
        usedFonts: [],
        violations: [],
        fontDetails: [] // NEW: detailed font info for display
    };
    
    // Extract all fonts from text layers
    const usedFonts = new Set();
    
    function extractFonts(layers) {
        if (!layers) return;
        
        for (const layer of layers) {
            if (layer.text) {
                // Try multiple ways to get font info
                if (layer.text.style?.font) {
                    usedFonts.add(layer.text.style.font);
                }
                if (layer.text.style?.fontName) {
                    usedFonts.add(layer.text.style.fontName);
                }
                if (layer.text.style?.fontFamily) {
                    usedFonts.add(layer.text.style.fontFamily);
                }
                
                // Check engineData for font info
                if (layer.text.document?.engineData?.EngineDict?.StyleRun?.RunArray) {
                    const runArray = layer.text.document.engineData.EngineDict.StyleRun.RunArray;
                    runArray.forEach(run => {
                        if (run.StyleSheet?.StyleSheetData?.Font) {
                            usedFonts.add(run.StyleSheet.StyleSheetData.Font);
                        }
                    });
                }
            }
            
            if (layer.children) {
                extractFonts(layer.children);
            }
        }
    }
    
    extractFonts(psdData.children);
    result.usedFonts = Array.from(usedFonts);
    
    // FIX: If no fonts found, it means there are no text layers
    if (result.usedFonts.length === 0) {
        result.hasNoFonts = true; // Flag for no fonts
        result.valid = true; // No fonts is not a violation
        return result;
    }
    
    // Check each font against approved list
    if (criteria.approvedFonts?.length > 0) {
        const approvedList = criteria.approvedFonts.map(f => f.toLowerCase().trim());
        
        result.usedFonts.forEach(font => {
            const fontLower = font.toLowerCase();
            const isApproved = approvedList.some(approved => 
                fontLower.includes(approved) || approved.includes(fontLower)
            );
            
            // Store detailed info for each font
            result.fontDetails.push({
                name: font,
                approved: isApproved
            });
            
            if (!isApproved) {
                result.violations.push(`Unapproved font: ${font}`);
                result.valid = false;
            }
        });
    } else {
        // If no approved list, all fonts are considered approved
        result.usedFonts.forEach(font => {
            result.fontDetails.push({
                name: font,
                approved: true
            });
        });
    }
    
    // Check for required fonts
    if (criteria.requiredFonts?.length > 0) {
        criteria.requiredFonts.forEach(reqFont => {
            if (!result.usedFonts.some(font => 
                font.toLowerCase().includes(reqFont.toLowerCase())
            )) {
                result.violations.push(`Missing required font: ${reqFont}`);
                result.valid = false;
            }
        });
    }
    
    return result;
}

// FIXED: Count ALL layers (including hidden ones)
function countAllLayers(psdData) {
    let count = 0;
    let hasBackground = false;
    
    function countInGroup(layers, depth = 0) {
        if (!layers) return;
        
        for (const layer of layers) {
            count++;
            const indent = '  '.repeat(depth);
            console.log(`${indent}Layer: "${layer.name || 'Unnamed'}" (hidden: ${layer.hidden || false})`);
            
            // Check if this is a background layer
            if (layer.name && layer.name.toLowerCase() === 'background') {
                hasBackground = true;
            }
            
            if (layer.children && layer.children.length > 0) {
                console.log(`${indent}  └─ Group with ${layer.children.length} children`);
                countInGroup(layer.children, depth + 1);
            }
        }
    }
    
    // Try different layer properties
    if (psdData.children && psdData.children.length > 0) {
        console.log(`  Counting layers from psdData.children:`);
        countInGroup(psdData.children);
    } else if (psdData.layers && psdData.layers.length > 0) {
        console.log(`  Counting layers from psdData.layers:`);
        countInGroup(psdData.layers);
    } else {
        console.log(`  ⚠️ No layer data found in PSD structure`);
        // If no layers found, assume at least a background layer exists
        console.log(`  Adding implicit background layer`);
        count = 1;
        hasBackground = true;
    }
    
    // CONSISTENCY FIX: If we have no layers at all, ensure we count at least the background
    if (count === 0) {
        console.log(`  No layers detected, assuming background layer exists`);
        count = 1;
    }
    
    // CONSISTENCY FIX: In Photoshop, there's always at least a background
    // If we only found a background layer and nothing else, still count it as 1
    // This ensures consistency between files with just background vs. those with multiple layers
    
    console.log(`  Total layer count: ${count} (has background: ${hasBackground})`);
    return count;
}

// FIXED: Get all layer names (including hidden)
function getAllLayerNames(psdData) {
    const names = [];
    
    function collectNames(layers, depth = 0) {
        if (!layers) return;
        
        for (const layer of layers) {
            if (layer.name) {
                names.push(layer.name);
                const indent = '  '.repeat(depth);
                console.log(`${indent}Found layer: "${layer.name}" (hidden: ${layer.hidden || false})`);
            }
            if (layer.children && layer.children.length > 0) {
                collectNames(layer.children, depth + 1);
            }
        }
    }
    
    // Try different layer properties
    if (psdData.children && psdData.children.length > 0) {
        collectNames(psdData.children);
    } else if (psdData.layers && psdData.layers.length > 0) {
        collectNames(psdData.layers);
    }
    
    console.log(`  Layer names found: [${names.join(', ')}]`);
    return names;
}

function generatePlaceholderThumbnail(width, height, colorMode) {
    try {
        const thumbnailCanvas = createCanvas(100, 100);
        const ctx = thumbnailCanvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, 100, 100);
        
        // Draw a placeholder rectangle with aspect ratio
        const scale = Math.min(80 / width, 80 / height);
        const rectWidth = width * scale;
        const rectHeight = height * scale;
        const x = (100 - rectWidth) / 2;
        const y = (100 - rectHeight) / 2;
        
        // Different colors for different modes
        if (colorMode === 4) { // CMYK
            ctx.fillStyle = '#00BCD4'; // Cyan-ish for CMYK
        } else if (colorMode === 1) { // Grayscale
            ctx.fillStyle = '#757575';
        } else { // RGB
            ctx.fillStyle = '#4CAF50';
        }
        
        ctx.fillRect(x, y, rectWidth, rectHeight);
        
        // Add text indicator
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const modeText = colorMode === 4 ? 'CMYK' : colorMode === 1 ? 'GRAY' : 'RGB';
        ctx.fillText(modeText, 50, 50);
        
        // Add dimensions text
        ctx.font = '8px Arial';
        ctx.fillText(`${width}×${height}`, 50, 65);
        
        return thumbnailCanvas.toDataURL('image/png');
    } catch (error) {
        console.log('  Failed to generate placeholder thumbnail');
        return null;
    }
}

function parseCanvasFilename(filename) {
    // Remove file extension first
    const nameWithoutExt = filename.replace(/\.(psd|zip)$/i, '');
    
    // Split by underscore
    const parts = nameWithoutExt.split('_');
    
    if (parts.length < 5) {
        // Not a Canvas filename format
        return null;
    }
    
    // Check if submission is late
    const isLate = parts[1] === 'LATE';
    
    // Adjust indices based on whether LATE is present
    const startIdx = isLate ? 2 : 1;
    
    // Extract components
    const result = {
        studentName: parts[0],
        isLate: isLate,
        submissionStatus: isLate ? 'LATE' : parts[1],
        userId: parts[startIdx],
        submissionId: parts[startIdx + 1],
        originalFilename: parts.slice(startIdx + 2).join('_') // Rejoin remaining parts
    };
    
    // Try to split student name into first/last
    // Canvas concatenates them, we'll make a best guess
    const nameMatch = result.studentName.match(/^([a-z]+)([A-Z][a-z]+)?$/);
    if (nameMatch) {
        result.firstName = nameMatch[1];
        result.lastName = nameMatch[2] || nameMatch[1];
    } else {
        // Fallback - use whole name as last name
        result.firstName = '';
        result.lastName = result.studentName;
    }
    
    console.log(`📋 Parsed Canvas filename:`, result);
    return result;
}

// Start server
app.listen(PORT, () => {
    console.log('🎨 PSD Grading Tool Server');
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log('\nReady to process PSD files...\n');
});

// Error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
