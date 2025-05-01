/**
 * 用於格式化輸出的輔助函數
 * 將複雜物件轉換為格式化 JSON 字符串，同時剔除 info 鍵值
 */
export const formatResponse = (data: any): string => {
  const formatValue = (value: any): any => {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.map(formatValue);
      }
      const formatted: any = {};
      for (const [key, val] of Object.entries(value)) {
        if (key !== 'info' && val !== undefined && val !== null) {
          formatted[key] = formatValue(val);
        }
      }
      return formatted;
    }
    return value;
  };
  return JSON.stringify(formatValue(data), null, 2);
}; 