// Remotion 项目配置
import { Config } from '@remotion/cli/config';
Config.setVideoImageFormat('jpeg');   // 速度快
Config.setOverwriteOutput(true);
Config.setConcurrency(4);
// 使用本机已装 Chrome,避免下载 Headless Shell (网络中断会导致下载失败)
Config.setBrowserExecutable('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
