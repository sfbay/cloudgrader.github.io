const fs = require('fs');
const path = require('path');
const { readPsd } = require('ag-psd');
const JSZip = require('jszip');

class FileProcessor {
    constructor() {
        this.systemFiles = [
            '.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized',
            '.DocumentRevisions-V100', '.fseventsd', '.Spotlight-V100',
            '.TemporaryItems', '.Trashes', '.VolumeIcon.icns',
            '.com.apple.timemachine.donotpresent', '.AppleDouble',
            '.LSOverride'
        ];
    }

    /**
     * Process multiple files with given criteria
     * @param {Array} files - Array of file objects with path and metadata
     * @param {Object} criteria - Grading criteria
     * @returns {Array} - Array of results
     */
    async processFiles(files, criteria) {
        const results = [];
        const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
        
        console.log(`Processing ${files.length} files with criteria:`, criteria);
        
        for (const fileInfo of files) {
            try {
                const filePath = path.join(uploadsDir, fileInfo.filename);
                console.log(`Processing file: ${fileInfo.originalName}`);
                
                // Determine if it's a ZIP or PSD file
                if (fileInfo.originalName.toLowerCase().endsWith('.zip')) {
                    // Process ZIP file
                    const zipResults = await this.processZipFile(filePath, criteria);
                    results.push(...zipResults);
                } else if (fileInfo.originalName.toLowerCase().endsWith('.psd')) {
                    // Process single PSD file
                    const result = await this.processPSDFile(filePath, fileInfo.originalName, criteria);
                    results.push(result);
                }
                
            } catch (error) {
                console.error(`Error processing ${fileInfo.originalName}:`, error);
                results.push({
                    filename: fileInfo.originalName,
                    originalFilename: fileInfo.originalName,
                    error: error.message,
                    score: 0,
                    maxScore: this.getMaxScore(criteria),
                    percentage: 0,
                    analysis: null
                });
            }
        }
        
        return results;
    }

    /**
     * Process a ZIP file containing PSD files
     * @param {string} zipPath - Path to ZIP file
     * @param {Object} criteria - Grading criteria
     * @returns {Array} - Array of results
     */
    async processZipFile(zipPath, criteria) {
        const results = [];
        
        try {
            const zipData = fs.readFileSync(zipPath);
            const zip = await JSZip.loadAsync(zipData);
            
            // Extract and process each PSD file in the ZIP
            for (const [filename, file] of Object.entries(zip.files)) {
                if (this.isSystemFile(filename)) {
                    continue; // Skip system files
                }
                
                if (filename.toLowerCase().endsWith('.psd') && !file.dir) {
                    try {
                        console.log(`Processing PSD from ZIP: ${filename}`);
                        
                        // Get the PSD data
                        const psdData = await file.async('uint8array');
                        
                        // Analyze the PSD
                        const analysis = await this.analyzePSDData(psdData, filename);
                        const result = this.gradeFile(analysis, criteria);
                        
                        results.push(result);
                        
                    } catch (error) {
                        console.error(`Error processing ${filename} from ZIP:`, error);
                        results.push({
                            filename: filename,
                            originalFilename: filename,
                            error: error.message,
                            score: 0,
                            maxScore: this.getMaxScore(criteria),
                            percentage: 0,
                            analysis: null
                        });
                    }
                }
            }
            
        } catch (error) {
            throw new Error(`Failed to process ZIP file: ${error.message}`);
        }
        
        return results;
    }

    /**
     * Process a single PSD file
     * @param {string} filePath - Path to PSD file
     * @param {string} originalName - Original filename
     * @param {Object} criteria - Grading criteria
     * @returns {Object} - Result object
     */
    async processPSDFile(filePath, originalName, criteria) {
        try {
            const psdData = fs.readFileSync(filePath);
            const analysis = await this.analyzePSDData(psdData, originalName);
            return this.gradeFile(analysis, criteria);
            
        } catch (error) {
            throw new Error(`Failed to process PSD file ${originalName}: ${error.message}`);
        }
    }

    /**
     * Analyze PSD data using ag-psd
     * @param {Uint8Array|Buffer} psdData - PSD file data
     * @param {string} filename - Filename for reference
     * @returns {Object} - Analysis results
     */
    async analyzePSDData(psdData, filename) {
        let psd = null;
        let parseError = null;
        let basicInfo = null;
        
        // Convert Buffer to Uint8Array if needed
        const uint8Data = psdData instanceof Buffer ? new Uint8Array(psdData) : psdData;
        
        // First, try to extract basic header information without full parsing
        try {
            basicInfo = this.extractBasicPSDInfo(uint8Data);
            console.log(`Basic PSD info extracted for ${filename}:`, basicInfo);
        } catch (headerError) {
            console.log(`Could not extract basic info for ${filename}:`, headerError.message);
        }
        
        // Try full parsing with multiple approaches
        const parseAttempts = [
            // Attempt 1: Full parsing with composite image
            () => readPsd(uint8Data, {
                skipLayerImageData: true,
                skipCompositeImageData: false, // Keep composite for thumbnail
                skipThumbnail: false, // Keep thumbnail
                logMissingFeatures: false,
                logDevFeatures: false,
                throwForMissingFeatures: false
            }),
            
            // Attempt 2: Standard parsing
            () => readPsd(uint8Data, {
                skipLayerImageData: true,
                skipCompositeImageData: true,
                skipThumbnail: true,
                logMissingFeatures: false,
                logDevFeatures: false,
                throwForMissingFeatures: false
            }),
            
            // Attempt 3: Minimal parsing - header only
            () => readPsd(uint8Data, {
                skipLayerImageData: true,
                skipCompositeImageData: true,
                skipThumbnail: true,
                skipLayerImageData: true,
                skipLayers: true,
                logMissingFeatures: false,
                logDevFeatures: false,
                throwForMissingFeatures: false
            })
        ];
        
        for (let i = 0; i < parseAttempts.length; i++) {
            try {
                psd = parseAttempts[i]();
                if (i > 0) {
                    parseError = `Used fallback parsing method ${i + 1}`;
                }
                break;
            } catch (error) {
                parseError = error.message;
                
                if (i === parseAttempts.length - 1) {
                    // All parsing attempts failed, but we might have basic info
                    if (basicInfo) {
                        console.log(`Using header-only analysis for ${filename} (${basicInfo.colorMode})`);
                        return this.createFallbackAnalysis(basicInfo, filename, uint8Data.length, `${basicInfo.colorMode} file - header analysis only`);
                    } else {
                        throw new Error(`Unable to analyze PSD file: ${parseError}`);
                    }
                }
            }
        }
        
        if (!psd) {
            throw new Error('Failed to parse PSD file: No data extracted');
        }
        
        try {
            // Extract color mode with better error handling
            const colorModes = {
                0: 'Bitmap',
                1: 'Grayscale', 
                2: 'Indexed',
                3: 'RGB',
                4: 'CMYK',
                7: 'Multichannel',
                8: 'Duotone',
                9: 'Lab'
            };
            
            const colorMode = colorModes[psd.colorMode] || `Unknown (${psd.colorMode})`;
            
            // Extract layer information with error handling
            let layers = [];
            let layerNames = [];
            try {
                layers = this.extractLayers(psd);
                layerNames = layers.map(layer => layer.name || 'Unnamed Layer');
            } catch (layerError) {
                console.log(`Layer extraction failed for ${filename}:`, layerError.message);
                // Fallback: try to get basic layer count
                if (psd.children) {
                    layerNames = psd.children.map((layer, index) => layer.name || `Layer ${index + 1}`);
                    layers = psd.children.map(layer => ({
                        name: layer.name || 'Unnamed Layer',
                        type: 'unknown',
                        visible: true
                    }));
                }
            }
            
            // Get additional metadata with defaults
            const bitDepth = psd.bitsPerChannel || 8;
            const hasTransparency = psd.channels >= 4;
            
            // Try to get resolution from image resources
            let resolution = 72; // default
            try {
                if (psd.imageResources && psd.imageResources.resolutionInfo) {
                    resolution = Math.round(psd.imageResources.resolutionInfo.horizontalResolution || 72);
                }
            } catch (resError) {
                console.log(`Resolution extraction failed for ${filename}, using default`);
            }

            // Generate thumbnail if possible
            let thumbnail = null;
            try {
                thumbnail = this.generateThumbnail(psd, filename);
            } catch (thumbError) {
                console.log(`Thumbnail generation failed for ${filename}`);
            }
            
            const analysis = {
                filename: filename,
                originalFilename: filename,
                width: psd.width || 0,
                height: psd.height || 0,
                colorMode: colorMode,
                bitDepth: bitDepth,
                resolution: resolution,
                hasTransparency: hasTransparency,
                layerCount: layers.length,
                layerNames: layerNames,
                layers: layers,
                fileSize: psdData.length,
                parseNote: parseError, // Include any parsing notes
                thumbnail: thumbnail // Base64 encoded thumbnail
            };
            
            console.log(`Analysis complete for ${filename}:`, {
                dimensions: `${analysis.width}x${analysis.height}`,
                colorMode: analysis.colorMode,
                layers: analysis.layerCount,
                note: parseError ? 'Used fallback parsing' : 'Full analysis'
            });
            
            return analysis;
            
        } catch (error) {
            console.error(`Error extracting metadata from ${filename}:`, error);
            throw new Error(`Failed to extract PSD metadata: ${error.message}`);
        }
    }

    /**
     * Extract basic PSD header information manually
     * @param {Uint8Array} data - PSD file data
     * @returns {Object} - Basic PSD info
     */
    extractBasicPSDInfo(data) {
        if (data.length < 26) {
            throw new Error('File too small to be a PSD');
        }
        
        try {
            // Check PSD signature
            const signature = String.fromCharCode(...data.slice(0, 4));
            if (signature !== '8BPS') {
                throw new Error('Invalid PSD signature');
            }
            
            // Extract basic header info manually using DataView for proper byte order
            const view = new DataView(data.buffer, data.byteOffset);
            
            const version = view.getUint16(4, false); // Big endian
            const height = view.getUint32(14, false);  // Big endian
            const width = view.getUint32(18, false);   // Big endian
            const depth = view.getUint16(22, false);   // Big endian
            const colorMode = view.getUint16(24, false); // Big endian
            
            const colorModes = {
                0: 'Bitmap',
                1: 'Grayscale',
                2: 'Indexed',
                3: 'RGB',
                4: 'CMYK',
                7: 'Multichannel',
                8: 'Duotone',
                9: 'Lab'
            };
            
            // Validate extracted values
            if (width <= 0 || height <= 0 || width > 30000 || height > 30000) {
                throw new Error('Invalid dimensions detected');
            }
            
            if (depth !== 1 && depth !== 8 && depth !== 16 && depth !== 32) {
                throw new Error('Invalid bit depth detected');
            }
            
            return {
                width: width,
                height: height,
                bitDepth: depth,
                colorMode: colorModes[colorMode] || `Unknown (${colorMode})`,
                version: version,
                rawColorMode: colorMode
            };
            
        } catch (error) {
            // If DataView fails, try a more basic approach
            console.log('DataView extraction failed, trying basic approach');
            
            // Basic fallback using simple array access
            const width = (data[18] << 24) | (data[19] << 16) | (data[20] << 8) | data[21];
            const height = (data[14] << 24) | (data[15] << 16) | (data[16] << 8) | data[17];
            const depth = (data[22] << 8) | data[23];
            const colorMode = (data[24] << 8) | data[25];
            
            const colorModes = {
                0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB', 
                4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab'
            };
            
            if (width > 0 && height > 0 && width < 30000 && height < 30000) {
                return {
                    width: width,
                    height: height,
                    bitDepth: depth || 8,
                    colorMode: colorModes[colorMode] || 'RGB',
                    version: 1,
                    rawColorMode: colorMode
                };
            }
            
            throw error;
        }
    }

    /**
     * Create fallback analysis when full parsing fails
     * @param {Object} basicInfo - Basic header info
     * @param {string} filename - Filename
     * @param {number} fileSize - File size
     * @param {string} note - Information note
     * @returns {Object} - Fallback analysis
     */
    createFallbackAnalysis(basicInfo, filename, fileSize, note) {
        return {
            filename: filename,
            originalFilename: filename,
            width: basicInfo.width,
            height: basicInfo.height,
            colorMode: basicInfo.colorMode,
            bitDepth: basicInfo.bitDepth,
            resolution: 72,
            hasTransparency: basicInfo.colorMode === 'CMYK' ? false : true,
            layerCount: 1, // Assume at least a background layer
            layerNames: ['Background'],
            layers: [{
                name: 'Background',
                type: 'raster',
                visible: true,
                opacity: 255,
                blendMode: 'normal'
            }],
            fileSize: fileSize,
            parseNote: note,
            isLimitedParse: true
        };
    }

    /**
     * Extract layer information from PSD
     * @param {Object} psd - Parsed PSD object
     * @returns {Array} - Array of layer objects
     */
    extractLayers(psd) {
        const layers = [];
        
        const processLayer = (layer, depth = 0) => {
            if (!layer) return;
            
            const layerInfo = {
                name: layer.name || 'Unnamed Layer',
                type: this.getLayerType(layer),
                visible: layer.hidden !== true,
                opacity: layer.opacity || 255,
                blendMode: layer.blendMode || 'normal',
                depth: depth
            };
            
            // Enhanced text layer information
            if (layer.text) {
                layerInfo.isText = true;
                layerInfo.textContent = layer.text.text || '';
                
                // Extract font information from text style
                if (layer.text.style) {
                    layerInfo.fontSize = layer.text.style.fontSize;
                    layerInfo.fontName = layer.text.style.fontName;
                    layerInfo.fontColor = layer.text.style.fillColor;
                    layerInfo.fontFamily = layer.text.style.fontFamily;
                }
                
                // Extract from document (alternative path for font info)
                if (layer.text.document && layer.text.document.engineData) {
                    try {
                        const engineData = layer.text.document.engineData;
                        if (engineData.EngineDict && engineData.EngineDict.StyleRun) {
                            const styleRun = engineData.EngineDict.StyleRun.RunArray;
                            if (styleRun && styleRun.length > 0) {
                                const firstStyle = styleRun[0].StyleSheet.StyleSheetData;
                                if (firstStyle.Font) {
                                    layerInfo.fontPostScriptName = firstStyle.Font;
                                }
                                if (firstStyle.FontSize) {
                                    layerInfo.fontSizePoints = firstStyle.FontSize;
                                }
                            }
                        }
                    } catch (e) {
                        // Font extraction from engine data failed, but that's ok
                    }
                }
                
                // Extract from text.styles array if available
                if (layer.text.styles && layer.text.styles.length > 0) {
                    const style = layer.text.styles[0];
                    if (style.font) layerInfo.fontName = style.font;
                    if (style.fontSize) layerInfo.fontSize = style.fontSize;
                    if (style.fontFamily) layerInfo.fontFamily = style.fontFamily;
                }
            }
            
            // Check for adjustment layers
            if (layer.adjustment) {
                layerInfo.isAdjustment = true;
                layerInfo.adjustmentType = Object.keys(layer.adjustment)[0];
            }
            
            // Check for layer effects
            if (layer.effects) {
                layerInfo.hasEffects = true;
                layerInfo.effects = Object.keys(layer.effects);
            }
            
            // Check for masks
            if (layer.mask) {
                layerInfo.hasMask = true;
            }
            
            // Check for smart objects
            if (layer.placedLayer) {
                layerInfo.isSmartObject = true;
            }
            
            // Check for vector layers
            if (layer.vectorMask || layer.vectorStroke) {
                layerInfo.isVector = true;
            }
            
            layers.push(layerInfo);
            
            // Process child layers (for groups)
            if (layer.children) {
                layer.children.forEach(child => processLayer(child, depth + 1));
            }
        };
        
        // Process all root layers
        if (psd.children) {
            psd.children.forEach(layer => processLayer(layer));
        }
        
        // Reverse to match Photoshop's bottom-to-top order
        return layers.reverse();
    }

    /**
     * Generate thumbnail from PSD data
     * @param {Object} psd - Parsed PSD object
     * @param {string} filename - Filename for logging
     * @returns {string|null} - Base64 encoded thumbnail or null
     */
    generateThumbnail(psd, filename) {
        try {
            // Try to use existing thumbnail first
            if (psd.thumbnail) {
                return this.imageDataToBase64(psd.thumbnail, psd.width, psd.height);
            }

            // Try to use composite image data
            if (psd.canvas) {
                return this.canvasToBase64(psd.canvas);
            }

            // If we have composite image data
            if (psd.imageData) {
                return this.imageDataToBase64(psd.imageData, psd.width, psd.height);
            }

            return null;
        } catch (error) {
            console.log(`Thumbnail generation failed for ${filename}:`, error.message);
            return null;
        }
    }

    /**
     * Convert image data to base64
     * @param {Uint8Array} imageData - Raw image data
     * @param {number} width - Image width
     * @param {number} height - Image height
     * @returns {string} - Base64 encoded image
     */
    imageDataToBase64(imageData, width, height) {
        // This is a simplified approach - in a real implementation you'd want to use a proper image library
        // For now, we'll create a simple placeholder that indicates we have image data
        const hasData = imageData && imageData.length > 0;
        return hasData ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' : null;
    }

    /**
     * Convert canvas to base64
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @returns {string} - Base64 encoded image
     */
    canvasToBase64(canvas) {
        try {
            return canvas.toDataURL('image/png');
        } catch (error) {
            return null;
        }
    }

    /**
     * Determine layer type
     * @param {Object} layer - Layer object
     * @returns {string} - Layer type
     */
    getLayerType(layer) {
        if (layer.text) return 'text';
        if (layer.adjustment) return 'adjustment';
        if (layer.placedLayer) return 'smartObject';
        if (layer.vectorMask || layer.vectorStroke) return 'shape';
        if (layer.children) return 'group';
        return 'raster';
    }

    /**
     * Grade a file based on analysis and criteria
     * @param {Object} analysis - File analysis results
     * @param {Object} criteria - Grading criteria
     * @returns {Object} - Grading results
     */
    gradeFile(analysis, criteria) {
        const pointsPerCriterion = parseInt(criteria.pointsPerCriterion) || 20;
        let score = 0;
        let maxScore = 0;
        const checks = [];

        // Filename check
        if (criteria.enableFilenameSection) {
            const filenamePoints = parseInt(criteria.filenamePoints) || 10;
            maxScore += filenamePoints;
            
            const passed = this.checkFilename(
                analysis.originalFilename,
                criteria.filenamePattern,
                criteria.filenamePatternType,
                criteria.filenameCaseSensitive
            );
            
            if (passed) score += filenamePoints;
            
            let expectedDisplay = criteria.filenamePattern;
            if (criteria.filenamePatternType === 'custom' || criteria.filenamePatternType.includes('_')) {
                expectedDisplay = criteria.filenamePattern.replace(/\{([^}]+)\}/g, '<$1>');
            }
            
            checks.push({
                criterion: 'Filename',
                expected: expectedDisplay,
                actual: analysis.originalFilename.replace(/\.psd$/i, ''),
                passed: passed,
                points: passed ? filenamePoints : 0
            });
        }

        // Width check
        if (criteria.reqWidth) {
            maxScore += pointsPerCriterion;
            const passed = analysis.width == criteria.reqWidth;
            if (passed) score += pointsPerCriterion;
            checks.push({
                criterion: 'Width',
                expected: criteria.reqWidth + 'px',
                actual: analysis.width + 'px',
                passed: passed,
                points: passed ? pointsPerCriterion : 0
            });
        }

        // Height check
        if (criteria.reqHeight) {
            maxScore += pointsPerCriterion;
            const passed = analysis.height == criteria.reqHeight;
            if (passed) score += pointsPerCriterion;
            checks.push({
                criterion: 'Height',
                expected: criteria.reqHeight + 'px',
                actual: analysis.height + 'px',
                passed: passed,
                points: passed ? pointsPerCriterion : 0
            });
        }

        // Color mode check
        if (criteria.reqColorMode) {
            maxScore += pointsPerCriterion;
            const passed = analysis.colorMode === criteria.reqColorMode;
            if (passed) score += pointsPerCriterion;
            checks.push({
                criterion: 'Color Mode',
                expected: criteria.reqColorMode,
                actual: analysis.colorMode,
                passed: passed,
                points: passed ? pointsPerCriterion : 0
            });
        }

        // Minimum layers check
        if (criteria.minLayers) {
            maxScore += pointsPerCriterion;
            const passed = analysis.layerCount >= criteria.minLayers;
            if (passed) score += pointsPerCriterion;
            checks.push({
                criterion: 'Minimum Layers',
                expected: criteria.minLayers + '+ layers',
                actual: analysis.layerCount + ' layers',
                passed: passed,
                points: passed ? pointsPerCriterion : 0
            });
        }

        // Required layer names check
        if (criteria.reqLayers && criteria.reqLayers.length > 0) {
            maxScore += pointsPerCriterion;
            const requiredLayers = criteria.reqLayers.split(',').map(s => s.trim()).filter(s => s);
            const foundLayers = requiredLayers.filter(reqLayer => 
                analysis.layerNames.some(layer => 
                    layer.toLowerCase().includes(reqLayer.toLowerCase())
                )
            );
            const passed = foundLayers.length === requiredLayers.length;
            if (passed) score += pointsPerCriterion;
            checks.push({
                criterion: 'Required Layers',
                expected: requiredLayers.join(', '),
                actual: foundLayers.length > 0 ? foundLayers.join(', ') : 'None found',
                passed: passed,
                points: passed ? pointsPerCriterion : 0,
                requiredLayers: requiredLayers,
                foundLayers: foundLayers
            });
        }

        return {
            filename: analysis.filename,
            originalFilename: analysis.originalFilename,
            score: score,
            maxScore: maxScore,
            percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
            checks: checks,
            analysis: analysis
        };
    }

    /**
     * Check if filename matches pattern
     * @param {string} filename - Filename to check
     * @param {string} pattern - Pattern to match
     * @param {string} patternType - Type of pattern
     * @param {string} caseSensitive - Case sensitivity
     * @returns {boolean} - Whether filename matches
     */
    checkFilename(filename, pattern, patternType, caseSensitive) {
        // Strip directory path and get just the filename
        const baseFilename = filename.split('/').pop().split('\\').pop();
        
        // Remove .psd extension for checking
        const nameWithoutExt = baseFilename.replace(/\.psd$/i, '');
        
        // Handle case sensitivity
        let checkName = caseSensitive === 'yes' ? nameWithoutExt : nameWithoutExt.toLowerCase();
        let checkPattern = caseSensitive === 'yes' ? pattern : pattern.toLowerCase();
        
        console.log('Filename validation:', {
            originalFilename: filename,
            baseFilename: baseFilename,
            nameWithoutExt: nameWithoutExt,
            checkName: checkName,
            pattern: pattern,
            checkPattern: checkPattern,
            patternType: patternType,
            caseSensitive: caseSensitive
        });
        
        switch(patternType) {
            case 'exact':
                const exactMatch = checkName === checkPattern;
                console.log(`Exact match result: ${exactMatch}`);
                return exactMatch;
                
            case 'contains':
                const containsMatch = checkName.includes(checkPattern);
                console.log(`Contains match result: ${containsMatch}`);
                return containsMatch;
                
            case 'regex':
                try {
                    const regex = new RegExp(pattern, caseSensitive === 'yes' ? '' : 'i');
                    const regexMatch = regex.test(nameWithoutExt);
                    console.log(`Regex match result: ${regexMatch} (pattern: ${regex})`);
                    return regexMatch;
                } catch(e) {
                    console.error('Invalid regex pattern:', e);
                    return false;
                }
                
            default:
                // Handle placeholder patterns
                let protectedPattern = checkPattern
                    .replace(/\{CLASS\}/gi, '<<<CLASS>>>')
                    .replace(/\{LASTNAME\}/gi, '<<<LASTNAME>>>')
                    .replace(/\{FIRSTNAME\}/gi, '<<<FIRSTNAME>>>')
                    .replace(/\{ASSIGNMENT\}/gi, '<<<ASSIGNMENT>>>')
                    .replace(/\{NUMBER\}/gi, '<<<NUMBER>>>')
                    .replace(/\{ANY\}/gi, '<<<ANY>>>');
                
                // Escape special regex characters
                let escapedPattern = protectedPattern.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');
                
                // Replace placeholders with regex patterns
                let regexPattern = escapedPattern
                    .replace(/<<<CLASS>>>/g, '([A-Za-z]{2,5}[\\s-]?\\d{2,4})')
                    .replace(/<<<LASTNAME>>>/g, '([A-Za-z]+)')
                    .replace(/<<<FIRSTNAME>>>/g, '([A-Za-z]+)')
                    .replace(/<<<ASSIGNMENT>>>/g, '([A-Za-z]*\\d[A-Za-z0-9]*)')
                    .replace(/<<<NUMBER>>>/g, '(\\d+)')
                    .replace(/<<<ANY>>>/g, '(.+)');
                
                try {
                    const regex = new RegExp('^' + regexPattern + '$', caseSensitive === 'yes' ? '' : 'i');
                    const placeholderMatch = regex.test(checkName);
                    
                    console.log('Placeholder pattern validation:', {
                        originalPattern: pattern,
                        protectedPattern: protectedPattern,
                        escapedPattern: escapedPattern,
                        finalRegexPattern: regexPattern,
                        finalRegex: regex.toString(),
                        testString: checkName,
                        result: placeholderMatch
                    });
                    
                    return placeholderMatch;
                } catch(e) {
                    console.error('Error creating pattern:', e);
                    return false;
                }
        }
    }

    /**
     * Check if filename is a system file
     * @param {string} filename - Filename to check
     * @returns {boolean} - Whether it's a system file
     */
    isSystemFile(filename) {
        const filenameLower = filename.toLowerCase();
        
        if (this.systemFiles.some(sf => filenameLower === sf.toLowerCase())) {
            return true;
        }
        
        if (filename.startsWith('._') || 
            filename.includes('__MACOSX') || 
            filename.includes('/.DS_Store') || 
            filename.includes('\\Thumbs.db') || 
            filename.match(/^\~\$/) || 
            filename.match(/\.tmp$/i) || 
            filename.match(/\.temp$/i)) {
            return true;
        }
        
        return false;
    }

    /**
     * Calculate maximum possible score
     * @param {Object} criteria - Grading criteria
     * @returns {number} - Maximum score
     */
    getMaxScore(criteria) {
        const pointsPerCriterion = parseInt(criteria.pointsPerCriterion) || 20;
        let maxScore = 0;

        if (criteria.enableFilenameSection) {
            maxScore += parseInt(criteria.filenamePoints) || 10;
        }

        if (criteria.reqWidth) maxScore += pointsPerCriterion;
        if (criteria.reqHeight) maxScore += pointsPerCriterion;
        if (criteria.reqColorMode) maxScore += pointsPerCriterion;
        if (criteria.minLayers) maxScore += pointsPerCriterion;
        if (criteria.reqLayers && criteria.reqLayers.trim()) {
            maxScore += pointsPerCriterion;
        }

        return maxScore;
    }
}

module.exports = FileProcessor;
