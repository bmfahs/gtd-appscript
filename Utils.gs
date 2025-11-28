/**
 * GTD System - Utility Functions
 */

/**
 * Generate a UUID
 */
function generateUUID() {
  return Utilities.getUuid();
}

/**
 * Format date for storage (YYYY-MM-DD)
 */
function formatDate(date) {
  if (!date) return '';
  if (date === '') return '';
  
  // If it's already a string in date format, return as-is
  if (typeof date === 'string') {
    // Check if it looks like a date string
    if (date.match(/^\d{4}-\d{2}-\d{2}/)) {
      return date.substring(0, 10);
    }
    return date;
  }
  
  // If it's a Date object (from Google Sheets)
  try {
    if (date instanceof Date) {
      return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    // Try to parse as date
    var d = new Date(date);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
  } catch (e) {
    Logger.log('formatDate error: ' + e.toString() + ' for value: ' + date);
  }
  
  return '';
}

/**
 * Safe wrapper for formatDate that never throws
 */
function safeFormatDate(date) {
  try {
    return formatDate(date);
  } catch (e) {
    return '';
  }
}

/**
 * Format datetime for storage
 */
function formatDateTime(date) {
  if (!date) return '';
  if (typeof date === 'string') return date;
  
  const d = new Date(date);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  return new Date(dateStr);
}

/**
 * Get current timestamp
 */
function now() {
  return formatDateTime(new Date());
}

/**
 * Get today's date string
 */
function today() {
  return formatDate(new Date());
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1, date2) {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);
  if (!d1 || !d2) return null;
  
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if date is overdue
 */
function isOverdue(dateStr) {
  if (!dateStr) return false;
  const date = parseDate(dateStr);
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  return date < todayDate;
}

/**
 * Check if date is today
 */
function isToday(dateStr) {
  if (!dateStr) return false;
  return formatDate(dateStr) === today();
}

/**
 * Convert row array to object using column indices
 */
function rowToObject(row, colIndices, prefix) {
  const obj = {};
  for (const [key, index] of Object.entries(colIndices)) {
    const propName = key.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    obj[propName] = row[index] !== undefined ? row[index] : '';
  }
  return obj;
}

/**
 * Convert object to row array using column indices
 */
function objectToRow(obj, colIndices) {
  const maxIndex = Math.max(...Object.values(colIndices));
  const row = new Array(maxIndex + 1).fill('');
  
  for (const [key, index] of Object.entries(colIndices)) {
    const propName = key.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    if (obj[propName] !== undefined) {
      row[index] = obj[propName];
    }
  }
  
  return row;
}

/**
 * Find row index by ID
 */
function findRowById(sheet, id, idColumn) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][idColumn] === id) {
      return i + 1; // 1-based row number
    }
  }
  return -1;
}

/**
 * Sanitize string for display
 */
function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Truncate string to length
 */
function truncate(str, length) {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.substring(0, length - 3) + '...';
}

/**
 * Deep clone an object
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Sort array by property
 */
function sortBy(array, property, ascending = true) {
  return array.sort((a, b) => {
    const aVal = a[property] || '';
    const bVal = b[property] || '';
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return ascending ? comparison : -comparison;
  });
}

/**
 * Group array by property
 */
function groupBy(array, property) {
  return array.reduce((groups, item) => {
    const key = item[property] || 'none';
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
}

/**
 * Filter tasks by multiple criteria
 */
function filterTasks(tasks, criteria) {
  return tasks.filter(task => {
    for (const [key, value] of Object.entries(criteria)) {
      if (Array.isArray(value)) {
        if (!value.includes(task[key])) return false;
      } else if (task[key] !== value) {
        return false;
      }
    }
    return true;
  });
}