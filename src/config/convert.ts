const convertToInteger = (value: string | number): number => {
  if (typeof value === 'string') {
    return parseInt(value, 10);
  }
  return value;
};

const convertToFloat = (value: string): number => {
  if (value !== '') {
    return parseFloat(value);
  }
  return 0;
};

export { convertToFloat, convertToInteger };
