import type { ThemeConfig } from 'antd';

export const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: '#4f46e5',
    colorInfo: '#4f46e5',
    borderRadius: 7,
    fontSize: 13,
    colorBgLayout: '#f4f5f8',
    fontFamily:
      '-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  components: {
    Layout: { headerBg: '#ffffff', siderBg: '#ffffff', headerHeight: 56 },
    Menu: { itemBorderRadius: 8 },
    Card: { borderRadiusLG: 8 },
  },
};

export const darkTheme: ThemeConfig = {
  token: {
    colorPrimary: '#818cf8',
    colorInfo: '#818cf8',
    borderRadius: 7,
    fontSize: 13,
  },
};
