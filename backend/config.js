require('dotenv').config();

module.exports = {
  dashscopeApiKey: process.env.DASHSCOPE_API_KEY,
  xfSparkUrl: process.env.XF_SPARK_URL,
  xfSparkPassword: process.env.XF_SPARK_PASSWORD,
  port: process.env.PORT || 3000
};