export default {
  outputFileTracingIncludes: {
    '/*': ['dashboard/index.html'],
    '/api/training-source': ['reports/training_history_for_ai.md'],
    '/api/queue': ['scripts/build_analysis_reports.mjs','tests/check_deployment.mjs','dashboard/*.js','dashboard/*.css','dashboard/index.html'],
  },
  async redirects(){return [{source:'/admin.html',destination:'/admin',permanent:false}];},
};
