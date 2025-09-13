/**
 * Frontend utilities for PSD analysis
 * This file contains helper functions for the client-side application
 */

/**
 * File validation utilities
 */
const FileValidator = {
    /**
     * Check if file is a valid PSD or ZIP file
     */
    isValidFile(file) {
        const validExtensions = ['.psd', '.zip'];
        const fileName = file.name.toLowerCase();
        return validExtensions.some(ext => fileName.endsWith(ext));
    },

    /**
     * Check if file is too large
     */
    isFileTooLarge(file, maxSizeMB = 100) {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        return file.size > maxSizeBytes;
    },

    /**
     * Get file extension
     */
    getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    },

    /**
     * Check if filename is a system file
     */
    isSystemFile(filename) {
        const systemFiles = [
            '.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized',
            '.DocumentRevisions-V100', '.fseventsd', '.Spotlight-V100',
            '.TemporaryItems', '.Trashes', '.VolumeIcon.icns'
        ];
        
        const filenameLower = filename.toLowerCase();
        
        if (systemFiles.some(sf => filenameLower === sf.toLowerCase())) {
            return true;
        }
        
        if (filename.startsWith('._') || 
            filename.includes('__MACOSX') || 
            filename.match(/^\~\$/) || 
            filename.match(/\.tmp$/i)) {
            return true;
        }
        
        return false;
    }
};

/**
 * Filename pattern utilities
 */
const FilenamePatterns = {
    /**
     * Validate filename against pattern
     */
    validateFilename(filename, pattern, patternType, caseSensitive = false) {
        const nameWithoutExt = filename.replace(/\.psd$/i, '');
        let checkName = caseSensitive ? nameWithoutExt : nameWithoutExt.toLowerCase();
        let checkPattern = caseSensitive ? pattern : pattern.toLowerCase();
        
        switch(patternType) {
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
                
            default:
                return this.validatePlaceholderPattern(nameWithoutExt, pattern, caseSensitive);
        }
    },

    /**
     * Validate placeholder patterns like {CLASS}_{LASTNAME}_{ASSIGNMENT}
     */
    validatePlaceholderPattern(filename, pattern, caseSensitive) {
        let checkName = caseSensitive ? filename : filename.toLowerCase();
        let checkPattern = caseSensitive ? pattern : pattern.toLowerCase();
        
        // Protect placeholders
        let protectedPattern = checkPattern
            .replace(/\{CLASS\}/gi, '<<<CLASS>>>')
            .replace(/\{LASTNAME\}/gi, '<<<LASTNAME>>>')
            .replace(/\{FIRSTNAME\}/gi, '<<<FIRSTNAME>>>')
            .replace(/\{ASSIGNMENT\}/gi, '<<<ASSIGNMENT>>>')
            .replace(/\{NUMBER\}/gi, '<<<NUMBER>>>')
            .replace(/\{ANY\}/gi, '<<<ANY>>>');
        
        // Escape regex special characters
        let escapedPattern = protectedPattern.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');
        
        // Replace placeholders with regex patterns
        let regexPattern = escapedPattern
            .replace(/<<<CLASS>>>/g, '([A-Za-z]{2,5}[\\s-]?\\d{2,4})')
            .replace(/<<<LASTNAME>>>/g, '([A-Za-z]+)')
            .replace(/<<<FIRSTNAME>>>/g, '([A-Za-z]+)')
            .replace(/<<<ASSIGNMENT>>>/g, '([A-Za-z]*[\\s-]?\\d+)')
            .replace(/<<<NUMBER>>>/g, '(\\d+)')
            .replace(/<<<ANY>>>/g, '(.+)');
        
        try {
            const regex = new RegExp('^' + regexPattern + '$', caseSensitive ? '' : 'i');
            return regex.test(checkName);
        } catch(e) {
            console.error('Error creating pattern:', e);
            return false;
        }
    },

    /**
     * Get example filename for a pattern
     */
    getPatternExample(pattern, patternType) {
        switch(patternType) {
            case 'class_name_assignment':
                return 'DES222_Smith_A01.psd';
            case 'name_class_assignment':
                return 'Smith_DES222_A01.psd';
            case 'assignment_name_class':
                return 'A01_Smith_DES222.psd';
            case 'exact':
                return pattern + '.psd';
            case 'contains':
                return 'MyFile_' + pattern + '_v1.psd';
            case 'regex':
                return 'Depends on your regex pattern';
            case 'custom':
                return pattern.replace(/\{CLASS\}/g, 'DES222')
                             .replace(/\{LASTNAME\}/g, 'Smith')
                             .replace(/\{FIRSTNAME\}/g, 'John')
                             .replace(/\{ASSIGNMENT\}/g, 'A01')
                             .replace(/\{NUMBER\}/g, '1')
                             .replace(/\{ANY\}/g, 'text') + '.psd';
            default:
                return 'example.psd';
        }
    }
};

/**
 * UI utilities
 */
const UIUtils = {
    /**
     * Format bytes to human readable format
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Debounce function to limit rapid function calls
     */
    debounce(func, wait, immediate) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func.apply(this, args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(this, args);
        };
    },

    /**
     * Create loading spinner element
     */
    createSpinner(text = 'Loading...') {
        const spinner = document.createElement('div');
        spinner.className = 'processing-indicator';
        spinner.innerHTML = `
            <div class="spinner"></div>
            <p>${text}</p>
        `;
        return spinner;
    },

    /**
     * Show/hide element with animation
     */
    toggleElement(element, show, animationClass = 'fade') {
        if (show) {
            element.style.display = 'block';
            element.classList.add(animationClass);
        } else {
            element.classList.remove(animationClass);
            setTimeout(() => {
                element.style.display = 'none';
            }, 300);
        }
    }
};

/**
 * Score calculation utilities
 */
const ScoreUtils = {
    /**
     * Calculate percentage score
     */
    calculatePercentage(score, maxScore) {
        if (maxScore === 0) return 0;
        return Math.round((score / maxScore) * 100);
    },

    /**
     * Get letter grade from percentage
     */
    getLetterGrade(percentage) {
        if (percentage >= 97) return 'A+';
        if (percentage >= 93) return 'A';
        if (percentage >= 90) return 'A-';
        if (percentage >= 87) return 'B+';
        if (percentage >= 83) return 'B';
        if (percentage >= 80) return 'B-';
        if (percentage >= 77) return 'C+';
        if (percentage >= 73) return 'C';
        if (percentage >= 70) return 'C-';
        if (percentage >= 67) return 'D+';
        if (percentage >= 63) return 'D';
        if (percentage >= 60) return 'D-';
        return 'F';
    },

    /**
     * Get color class for score
     */
    getScoreColorClass(percentage) {
        if (percentage >= 100) return 'score-100';
        if (percentage >= 90) return 'score-90';
        if (percentage >= 80) return 'score-80';
        if (percentage >= 70) return 'score-70';
        if (percentage >= 60) return 'score-60';
        if (percentage >= 50) return 'score-50';
        if (percentage >= 40) return 'score-40';
        if (percentage >= 30) return 'score-30';
        if (percentage >= 20) return 'score-20';
        if (percentage >= 10) return 'score-10';
        return 'score-0';
    }
};

/**
 * Export utilities for use in other modules
 */
window.PSDUtils = {
    FileValidator,
    FilenamePatterns,
    UIUtils,
    ScoreUtils
};

// Add some helpful console messages for debugging
console.log('🎨 PSD Analyzer utilities loaded');
console.log('Available utilities:', Object.keys(window.PSDUtils));
