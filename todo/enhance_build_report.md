# Build Report Enhancement Plan

## Executive Summary

Enhance the build report to provide comprehensive insights into code quality, security, performance, and test coverage. The current report provides basic test pass/fail status but lacks detailed metrics, static analysis, and direct links to relevant source files.

## Current State

### What Works
- 5 parallel test jobs (linting, unit, integration, API, E2E)
- HTML report generation with pass/fail status
- GitHub Pages deployment
- 138 API tests across 11 test suites
- Basic test output capture

### Gaps Identified
- No code coverage metrics
- No complexity analysis
- No security scanning (SAST, dependency vulnerabilities)
- No performance metrics
- Limited linting (syntax check only, no ESLint)
- No links from artifacts to source files
- No historical trend tracking
- No structural analysis (dependency graphs, dead code)
- No documentation coverage metrics

## Enhancement Goals

### 1. Code Coverage Reports
**Objective**: Track and visualize code coverage across all JavaScript source files.

**Implementation**:
- Add **c8** for coverage collection (native V8 coverage, faster than Istanbul/NYC)
- Skip Cloudflare Worker-specific coverage (not attempted)
- Generate coverage reports in multiple formats (HTML, JSON, LCOV)
- Display coverage metrics: line, branch, function, statement coverage
- Set coverage thresholds: 80% line coverage, 70% branch coverage (warning only, non-blocking)
- Show file-by-file coverage breakdown with links to source
- Publish coverage data as JSON to GitHub Pages for programmatic access

**Metrics to Track**:
- Overall coverage percentage (line, branch, function, statement)
- Per-file coverage percentage
- Uncovered lines/branches by file
- Coverage trend over time
- Files with declining coverage

**Artifacts with Source Links**:
- Coverage report HTML: Each file name links to GitHub blob view
- Uncovered line numbers link directly to specific line ranges
- Example: `src/api/auth.js:45-67` links to GitHub with line highlights

### 2. Complexity Analysis
**Objective**: Identify complex code that may need refactoring.

**Implementation**:
- Use **eslint-plugin-complexity** (built into ESLint) for cyclomatic complexity
- Calculate cyclomatic complexity per function
- Calculate Halstead complexity metrics using additional tools if needed
- Flag functions exceeding thresholds: cyclomatic complexity >10, cognitive complexity >15
- Provide recommendations (non-blocking) for refactoring

**Metrics to Track**:
- Cyclomatic complexity per function (threshold: 10)
- Cognitive complexity per function (threshold: 15)
- Maintainability index per file (scale: 0-100)
- Average complexity per file/directory
- Functions with highest complexity (top 10)

**Artifacts with Source Links**:
- Complexity report: Function names link to GitHub at function definition
- Example: `authenticateUser()` in `src/auth/middleware.js:123` links directly

### 3. Security Analysis
**Objective**: Identify security vulnerabilities and risky code patterns.

**Implementation**:
- **Dependency Scanning**: Run `npm audit` and generate JSON report
- **SAST**: Use ESLint security plugins (eslint-plugin-security, eslint-plugin-no-unsanitized)
- **Secret Detection**: Scan for hardcoded secrets/API keys using custom patterns or ESLint rules
- **Best Practices**: Check for common vulnerabilities (XSS, injection, insecure randomness)
- **Warning Only**: Security findings warn but do not block builds (no remediation timeline enforced)
- Publish security data as JSON to GitHub Pages

**Metrics to Track**:
- Dependency vulnerabilities by severity (critical, high, medium, low)
- SAST findings by category (injection, XSS, auth issues, etc.)
- Number of secrets detected (should be 0)
- Security debt score (custom metric based on findings)

**Artifacts with Source Links**:
- Vulnerability report: Each finding links to affected file and line
- Dependency vulnerabilities link to package.json and lockfile
- Example: SQL injection risk in `src/api/content.js:234` links directly

### 4. Enhanced Linting & Code Quality
**Objective**: Enforce consistent code style and catch common errors.

**Implementation**:
- Replace basic syntax check with full ESLint configuration
- Add ESLint plugins: security, no-unsanitized, promise, node
- Configure Prettier for formatting checks
- Check for unused variables, imports, and dead code
- Validate JSDoc comments where present

**Metrics to Track**:
- Total lint errors and warnings by category
- Files with most lint issues
- Lint error trend over time
- Dead code detection results

**Artifacts with Source Links**:
- Lint report: Each issue links to file and line number
- Example: "Unused variable 'result'" in `src/utils/pricing.js:89` links directly

### 5. Structural Analysis
**Objective**: Visualize code structure and identify architectural issues.

**Implementation**:
- Use **Madge** for dependency graph generation and circular dependency detection
- Generate dependency graphs (file-to-file imports)
- Identify circular dependencies
- Calculate coupling metrics (afferent/efferent coupling)
- Detect dead/unused code
- Analyze module cohesion
- Create interactive visualization using D3.js or similar (desktop-only, mobile not required)

**Metrics to Track**:
- Number of circular dependencies
- Module coupling scores
- Dead code files/functions count
- Dependency depth (deepest import chain)
- Orphaned files (not imported by anything)

**Artifacts with Source Links**:
- Dependency graph: Interactive visualization with clickable nodes
- Circular dependency list: Links to files involved in cycle
- Dead code report: Links to unused functions/files

### 6. Performance Metrics
**Objective**: Track API performance and identify bottlenecks.

**Implementation**:
- Modify existing API tests to include response time tracking
- Measure and report performance data from Phase 1 (MVP)
- Calculate percentiles (p50, p95, p99) for each endpoint
- Track memory usage during test execution
- Measure startup time for Worker
- Report all performance metrics (no failure thresholds - warning only)
- Publish performance data as JSON to GitHub Pages (raw tool output format)

**Metrics to Track**:
- Response time percentiles per endpoint
- Average response time by API category
- Memory usage during tests
- Performance trends over time
- Endpoints with increasing response times

**Artifacts with Source Links**:
- Performance report: Endpoints link to handler implementation
- Example: POST /api/content (1.2s avg) links to `src/api/content.js:uploadContent`

### 7. Documentation Coverage
**Objective**: Ensure code is adequately documented.

**Implementation**:
- Scan for JSDoc comments on functions
- Check parameter and return type documentation
- Validate JSDoc syntax
- Calculate documentation coverage percentage
- Generate API documentation from JSDoc

**Metrics to Track**:
- Percentage of functions with JSDoc
- Percentage of parameters documented
- JSDoc validation errors
- Public API documentation coverage

**Artifacts with Source Links**:
- Documentation report: Undocumented functions link to source
- Generated API docs: Each function links back to source implementation

### 8. Test Report Enhancements
**Objective**: Provide richer test execution details.

**Implementation**:
- Show test execution time per suite and test
- Display flaky test detection (tests that sometimes fail)
- Add test output filtering (show only failures option)
- Include retry information
- Link test names to test file implementations

**Metrics to Track**:
- Test execution time by suite
- Slowest tests (top 10)
- Flaky test count and names
- Test success rate over time
- Tests added/removed in this build

**Artifacts with Source Links**:
- Test report: Each test name links to test file and line number
- Failing tests link to both test code and code under test
- Example: "auth.test.js:45 - POST /api/auth" links to test file

### 9. Visual Regression Testing
**Objective**: Detect unintended visual changes to UI pages.

**Implementation**:
- Capture screenshots of all 14 HTML frontend pages during build
- Store baseline images for comparison
- Detect visual differences between builds
- Generate visual diff reports highlighting changes
- Link to affected pages with side-by-side comparison
- Use Puppeteer or Playwright for screenshot capture

**Pages to Test** (all 14 frontend HTML files):
- Landing page, upload, dashboard, api-keys, transactions, admin, login, profile, settings, docs, help, privacy, terms, contact (or actual file list from repository)

**Metrics to Track**:
- Number of pages with visual changes
- Percentage of page area changed
- Pages requiring baseline updates
- Visual regression trend over time

**Artifacts with Source Links**:
- Visual diff report: Changed pages link to HTML file in repo
- Screenshot comparison: Link to page source and CSS files
- Example: Change detected in `upload.html` links to file and related CSS

### 10. Build Metadata & History
**Objective**: Provide context and historical trends.

**Implementation**:
- Store historical build data as GitHub Actions artifacts (use GitHub default retention policy)
- Generate trend charts (coverage over time, test count, etc.)
- Compare current build to previous builds
- Show commit changes that triggered build
- Link to PR if build is from PR
- Publish historical data as JSON to GitHub Pages for trend analysis

**Metrics to Track**:
- Build duration trend
- Coverage trend (last 30 builds)
- Test count trend
- Failure rate over time
- Most frequently failing tests

**Artifacts with Source Links**:
- Commit diff: Link to GitHub compare view
- Changed files: Link to specific file diffs
- PR link if applicable

## Implementation Plan

**Strategy**: Implement phases sequentially. Phase 1 (Coverage + Security + Performance) is the MVP.

### Phase 1: MVP - Coverage, Security & Performance
1. Add c8 for coverage collection
2. Configure ESLint with security and quality plugins
3. Integrate npm audit for dependency scanning
4. Modify existing API tests to include performance timing
5. Update build-report.yml to run on main branch only
6. Set up subdirectory structure for reports (see Appendix B)
7. Generate coverage HTML reports with source links
8. Generate security findings report with source links
9. Generate performance metrics report with source links
10. Create main report page as table of contents
11. Create separate report pages for coverage, security, and performance
12. Publish JSON data files in internal tool formats (coverage.json, security.json, performance.json)
13. All findings are warnings only (non-blocking)

**Deliverables**:
- Coverage reports with file links (HTML + JSON in internal tool format)
- Security vulnerability reports with source links (HTML + JSON in internal tool format)
- Performance metrics report with endpoint timings (HTML + JSON)
- Main report page (TOC) linking to separate job-specific reports
- Subdirectory structure for organized report files

### Phase 2: Code Quality & Complexity
1. Add complexity analysis (eslint-plugin-complexity)
2. Enhance linting with additional rules and plugins
3. Add dead code detection
4. Create complexity report page with source links
5. Generate enhanced lint report page
6. Update main TOC to link to new report pages
7. Publish JSON data files (complexity.json, lint.json)

**Deliverables**:
- Complexity analysis report (HTML + JSON)
- Enhanced lint report (HTML + JSON)
- Updated main report page

### Phase 3: Structural Analysis
1. Add Madge for dependency graph generation
2. Implement circular dependency detection
3. Create structural analysis report page with interactive graph (D3.js or similar)
4. Update main TOC to link to structural analysis report
5. Publish JSON data file (structure.json in internal tool format)

**Deliverables**:
- Dependency visualization with interactive graph (HTML + JSON)
- Circular dependency detection (HTML + JSON)
- Structural analysis report (HTML + JSON)
- Updated main report page

### Phase 4: Documentation, History & Visual Regression
1. Add JSDoc coverage analysis
2. Generate API documentation
3. Implement historical data storage (GitHub Actions artifacts)
4. Create trend visualization using historical data
5. Add comparison to previous builds
6. Implement visual regression testing for all 14 HTML frontend pages
7. Set up Puppeteer/Playwright for screenshot capture
8. Create documentation report page
9. Create historical trends page
10. Create visual regression report page with side-by-side comparisons
11. Update main TOC to link to all report pages
12. Publish all JSON data files (internal tool formats)

**Deliverables**:
- Documentation coverage report (HTML + JSON)
- Historical trends page with charts (HTML + JSON)
- Visual regression report for all 14 pages (HTML + JSON with baseline/current screenshots)
- Complete enhanced build report with all sections
- Full JSON data export for all metrics in internal tool formats

## Test Plan

### Coverage Testing

#### Test 1: Coverage Report Generation
- **Given**: A codebase with 100 lines, 50 covered by tests
- **When**: Coverage analysis runs
- **Then**: Report shows 50% line coverage
- **Verification**: Check coverage percentage matches manual calculation

#### Test 2: File Coverage Links
- **Given**: Coverage report shows `src/api/auth.js` with 80% coverage
- **When**: User clicks on filename
- **Then**: Browser navigates to GitHub blob view of that file
- **Verification**: URL contains correct repo, branch, and file path

#### Test 3: Uncovered Lines Link
- **Given**: Lines 45-67 are uncovered in `src/api/auth.js`
- **When**: User clicks on uncovered line range
- **Then**: Browser navigates to GitHub with lines 45-67 highlighted
- **Verification**: URL contains `#L45-L67` fragment

#### Test 4: Coverage Threshold Failure
- **Given**: Coverage threshold set to 80%, actual coverage is 75%
- **When**: Build report generates
- **Then**: Coverage section shows red/failed status
- **Verification**: Build report background color indicates failure

#### Test 5: Zero Coverage File
- **Given**: A file with 0% coverage exists
- **When**: Coverage report generates
- **Then**: File appears in report with 0% and red indicator
- **Verification**: File is included in report, not omitted

#### Test 6: Full Coverage File
- **Given**: A file with 100% coverage exists
- **When**: Coverage report generates
- **Then**: File appears with 100% and green indicator
- **Verification**: All coverage metrics (line, branch, function, statement) are 100%

#### Test 7: Coverage JSON Export
- **Given**: Coverage analysis completes
- **When**: Report generates
- **Then**: JSON coverage file is created and stored as artifact
- **Verification**: JSON file exists, is valid JSON, contains expected structure

### Security Testing

#### Test 8: Critical Vulnerability Detection
- **Given**: A critical dependency vulnerability exists
- **When**: Security scan runs
- **Then**: Report shows critical vulnerability with details
- **Verification**: Vulnerability severity, package name, and CVE displayed

#### Test 9: Vulnerability Link to Package.json
- **Given**: Vulnerable dependency listed in package.json line 45
- **When**: User clicks vulnerability
- **Then**: Browser navigates to package.json:45 on GitHub
- **Verification**: Correct line is highlighted

#### Test 10: Secret Detection
- **Given**: Code contains hardcoded API key pattern
- **When**: Secret scanning runs
- **Then**: Secret is detected and reported with file location
- **Verification**: Report shows file, line number, and redacted secret pattern

#### Test 11: SAST Finding with Line Link
- **Given**: Potential SQL injection on line 234 of content.js
- **When**: SAST scan completes
- **Then**: Finding links to src/api/content.js:234 on GitHub
- **Verification**: Link navigates to correct file and line

#### Test 12: Zero Security Issues
- **Given**: No security vulnerabilities or issues found
- **When**: Security report generates
- **Then**: Report shows "No issues found" with green status
- **Verification**: Security section has green indicator

#### Test 13: npm Audit JSON Export
- **Given**: npm audit runs
- **When**: Security report generates
- **Then**: Full npm audit JSON is stored as artifact
- **Verification**: Artifact contains complete audit data

### Complexity Testing

#### Test 14: High Complexity Function Detection
- **Given**: Function with cyclomatic complexity of 25
- **When**: Complexity analysis runs
- **Then**: Function flagged as high complexity with warning
- **Verification**: Function appears in "Needs Refactoring" section

#### Test 15: Complexity Link to Function
- **Given**: Complex function starts at line 123 in middleware.js
- **When**: User clicks function name in report
- **Then**: Browser navigates to src/auth/middleware.js:123
- **Verification**: GitHub shows function definition at that line

#### Test 16: File-Level Maintainability
- **Given**: File has maintainability index of 35 (low)
- **When**: Complexity report generates
- **Then**: File shows red indicator with maintainability score
- **Verification**: Score displayed correctly, color indicates poor maintainability

#### Test 17: Complexity Threshold Pass
- **Given**: All functions have complexity below threshold (10)
- **When**: Complexity analysis completes
- **Then**: Complexity section shows green/passed status
- **Verification**: No warnings, all metrics within limits

#### Test 18: Top 10 Complex Functions
- **Given**: 50 functions with varying complexity
- **When**: Report generates
- **Then**: Report lists exactly 10 most complex functions
- **Verification**: List sorted by complexity descending, top 10 shown

### Linting Testing

#### Test 19: ESLint Error with Link
- **Given**: Unused variable on line 89 of pricing.js
- **When**: ESLint runs
- **Then**: Error links to src/utils/pricing.js:89
- **Verification**: Clicking link navigates to correct location

#### Test 20: Lint Error Categorization
- **Given**: Lint run finds 5 errors, 10 warnings
- **When**: Lint report generates
- **Then**: Report shows errors and warnings separately
- **Verification**: Correct counts, proper categorization

#### Test 21: Dead Code Detection
- **Given**: Unused function exists in utils.js
- **When**: Dead code analysis runs
- **Then**: Function reported as unused with link to definition
- **Verification**: Link points to function start line

#### Test 22: No Lint Issues
- **Given**: Code passes all lint rules
- **When**: Linting completes
- **Then**: Report shows "No issues" with green status
- **Verification**: Lint section has green indicator

### Structural Analysis Testing

#### Test 23: Circular Dependency Detection
- **Given**: File A imports B, B imports C, C imports A
- **When**: Structural analysis runs
- **Then**: Report shows circular dependency with all 3 files linked
- **Verification**: All files in cycle are identified and linked

#### Test 24: Dependency Graph Generation
- **Given**: Project has 27 source files
- **When**: Dependency graph generates
- **Then**: Graph shows all files as nodes with import edges
- **Verification**: Graph is interactive, nodes clickable, links to files

#### Test 25: Dead Code File Detection
- **Given**: File exists but is never imported
- **When**: Dead code analysis runs
- **Then**: File reported as orphaned with link
- **Verification**: File link navigates to GitHub

#### Test 26: Zero Circular Dependencies
- **Given**: No circular dependencies exist
- **When**: Structural analysis completes
- **Then**: Report shows "No circular dependencies" with green status
- **Verification**: Clean bill of health displayed

### Performance Testing

#### Test 27: Slow Endpoint Detection
- **Given**: POST /api/content averages 1200ms
- **When**: Performance analysis runs
- **Then**: Endpoint flagged as slow (>500ms threshold)
- **Verification**: Response time shown, links to handler function

#### Test 28: Performance Metrics per Endpoint
- **Given**: API tests hit 15 different endpoints
- **When**: Performance report generates
- **Then**: Report shows p50, p95, p99 for each endpoint
- **Verification**: All percentiles calculated and displayed

#### Test 29: Performance Link to Handler
- **Given**: Slow endpoint handled by uploadContent function
- **When**: User clicks endpoint in performance report
- **Then**: Browser navigates to function definition in source
- **Verification**: Links to correct function in api/content.js

#### Test 30: Memory Usage Tracking
- **Given**: Tests execute with peak memory of 256MB
- **When**: Performance report generates
- **Then**: Memory usage graph/metric displayed
- **Verification**: Peak and average memory shown

### Documentation Testing

#### Test 31: Undocumented Function Detection
- **Given**: Public function lacks JSDoc comment
- **When**: Documentation analysis runs
- **Then**: Function listed as undocumented with link
- **Verification**: Link navigates to function definition

#### Test 32: Documentation Coverage Percentage
- **Given**: 80 out of 100 functions have JSDoc
- **When**: Documentation report generates
- **Then**: Report shows 80% documentation coverage
- **Verification**: Percentage calculation correct

#### Test 33: JSDoc Validation Error
- **Given**: JSDoc has invalid @param type syntax
- **When**: JSDoc validation runs
- **Then**: Error reported with file and line number link
- **Verification**: Link points to JSDoc comment location

#### Test 34: Generated API Docs Link Back
- **Given**: Generated API docs include authenticateUser function
- **When**: User views API documentation
- **Then**: Function documentation links back to source implementation
- **Verification**: "View Source" link navigates to GitHub

### Test Report Enhancement Testing

#### Test 35: Test Execution Time Display
- **Given**: Test suite takes 45 seconds to run
- **When**: Test report generates
- **Then**: Execution time shown for suite
- **Verification**: Time displayed in human-readable format (45s)

#### Test 36: Slowest Tests List
- **Given**: 138 tests with varying execution times
- **When**: Test report generates
- **Then**: Top 10 slowest tests displayed
- **Verification**: List sorted by duration descending

#### Test 37: Test Name Link to Test File
- **Given**: Test defined in scripts/api-tests/auth-tests.sh:123
- **When**: User clicks test name
- **Then**: Browser navigates to test file at that line
- **Verification**: Correct test file and line shown

#### Test 38: Failing Test Links to Code Under Test
- **Given**: Failing test for authenticateUser function
- **When**: Test report shows failure
- **Then**: Links provided to both test code and function implementation
- **Verification**: Both links present and functional

#### Test 39: Flaky Test Detection
- **Given**: Test passes 8 out of 10 runs
- **When**: Flaky test analysis runs
- **Then**: Test flagged as flaky with success rate
- **Verification**: Success rate (80%) displayed

### Historical Data Testing

#### Test 40: Build History Storage
- **Given**: Build completes successfully
- **When**: Historical data saves
- **Then**: JSON file with build metrics stored as artifact
- **Verification**: JSON contains timestamp, metrics, commit SHA

#### Test 41: Coverage Trend Chart
- **Given**: Last 30 builds have varying coverage
- **When**: Trend chart generates
- **Then**: Line chart shows coverage over time
- **Verification**: Chart data matches stored history

#### Test 42: Comparison to Previous Build
- **Given**: Previous build had 85% coverage, current has 82%
- **When**: Comparison generates
- **Then**: Report shows -3% change with red indicator
- **Verification**: Delta calculation correct, color indicates regression

#### Test 43: Commit Diff Link
- **Given**: Build triggered by commit abc123
- **When**: Build report generates
- **Then**: Link to GitHub compare view (previous commit...abc123)
- **Verification**: Compare URL correct, shows file changes

#### Test 44: Most Frequently Failing Tests
- **Given**: Historical data for last 30 builds
- **When**: Failure frequency analysis runs
- **Then**: Report shows top 5 most frequently failing tests
- **Verification**: Failure counts accurate, sorted correctly

### Integration Testing

#### Test 45: Report Generation with All Sections
- **Given**: All analysis tools complete successfully
- **When**: Build report generates
- **Then**: HTML contains all enhancement sections
- **Verification**: Coverage, security, complexity, etc. all present

#### Test 46: Report Generation with Partial Failures
- **Given**: Security scan fails, but other analyses succeed
- **When**: Build report generates
- **Then**: Report shows results for successful analyses, error for failed
- **Verification**: Partial results displayed, failure clearly indicated

#### Test 47: GitHub Pages Deployment
- **Given**: Enhanced build report generated
- **When**: Deployment to gh-pages occurs
- **Then**: All report files and assets accessible via Pages URL
- **Verification**: Access report in browser, all links work

#### Test 48: Large Codebase Performance
- **Given**: Codebase with 10,000+ lines
- **When**: All analyses run
- **Then**: Build completes within reasonable time (< 10 minutes)
- **Verification**: Monitor build duration, ensure acceptable performance

#### Test 49: Zero Source Files Edge Case
- **Given**: Repository with no JavaScript source files
- **When**: Analyses attempt to run
- **Then**: Reports handle gracefully with "No files to analyze" messages
- **Verification**: No crashes, clear messaging

#### Test 50: All External Links Valid
- **Given**: Report contains GitHub source links
- **When**: Link validation runs
- **Then**: All links return 200 status (or 404 if file deleted)
- **Verification**: Automated link checker validates all URLs

### Edge Cases

#### Test 51: File Deleted Between Analysis and Report
- **Given**: File analyzed for coverage, then deleted before report generates
- **When**: Report generation attempts to link to file
- **Then**: Link still generated, GitHub shows 404 (handled gracefully)
- **Verification**: Report doesn't crash, link present even if file gone

#### Test 52: Very Long File Path
- **Given**: File path exceeds 200 characters
- **When**: Links generated in report
- **Then**: Link works correctly, path displayed with truncation
- **Verification**: Full path in link, truncated display in UI

#### Test 53: Special Characters in Filename
- **Given**: File named `my-file[test].js`
- **When**: Links generated
- **Then**: URL properly encodes special characters
- **Verification**: Link navigates correctly with encoded URL

#### Test 54: Binary File in Analysis
- **Given**: Analysis encounters a .png file
- **When**: Tools attempt to analyze
- **Then**: Binary file skipped gracefully
- **Verification**: No errors, file excluded from text-based analyses

#### Test 55: Non-UTF8 File Encoding
- **Given**: File uses ISO-8859-1 encoding
- **When**: Analysis tools read file
- **Then**: Encoding handled correctly or file skipped
- **Verification**: No character corruption or crashes

#### Test 56: Empty File
- **Given**: Source file exists but is empty (0 bytes)
- **When**: Analyses run
- **Then**: File reported with 0% coverage, no complexity metrics
- **Verification**: Graceful handling, no division by zero errors

#### Test 57: Extremely Complex Function
- **Given**: Function with cyclomatic complexity of 500
- **When**: Complexity analysis runs
- **Then**: Complexity reported accurately, system doesn't crash
- **Verification**: High values handled correctly

#### Test 58: Thousands of Lint Errors
- **Given**: Code has 5000+ lint errors
- **When**: Lint report generates
- **Then**: Report paginated or truncated with "Show All" option
- **Verification**: Report doesn't become unusable due to size

#### Test 59: Network Failure During GitHub Link
- **Given**: GitHub API rate limited or unavailable
- **When**: Report tries to generate links
- **Then**: Fallback links generated (best effort) or error message
- **Verification**: Report still generates, handles API failures gracefully

#### Test 60: Concurrent Builds
- **Given**: Two builds running simultaneously
- **When**: Both try to deploy reports
- **Then**: Each build has unique report (timestamp/SHA in path)
- **Verification**: No conflicts, both reports accessible

## Resolved Decisions

All initial open questions have been answered. Here are the key decisions:

### Technical Decisions
- **Coverage Tool**: c8 (native V8 coverage, faster than Istanbul/NYC)
- **Worker Coverage**: Not attempted (too complex for current scope)
- **Historical Storage**: GitHub Actions artifacts with default retention policy
- **Dependency Graph**: Madge with D3.js for visualization
- **Performance Reporting**: Measure and report from Phase 1, no failure thresholds (warnings only)
- **Report Size**: Main page is TOC, separate pages for each analysis type
- **External Dependencies**: Approved to add npm packages as needed
- **JSON Format**: Publish internal tool output formats (c8 format, npm audit format, etc.)
- **Report Organization**: Subdirectory structure for organized report files
- **Build Timing**: Use GitHub Actions logs, no custom build performance tracking
- **Visual Regression Scope**: All 14 HTML frontend pages

### Process & Policy Decisions
- **Coverage Thresholds**: 80% line coverage, 70% branch coverage - warning only (non-blocking)
- **Complexity Thresholds**: Cyclomatic >10, cognitive >15 - recommend refactoring (non-blocking)
- **Security Findings**: Warning only, no build blocking, no remediation timeline enforced
- **Test Ownership**: Recommend CI/CD maintainer owns test infrastructure (see below)

### User Experience Decisions
- **Report Navigation**: Main page is table of contents, links to separate job-specific report pages
- **Mobile Responsiveness**: Desktop-only, mobile not required
- **Accessibility**: WCAG compliance testing not included
- **Notifications**: No automated notifications/alerts

### Scope & Integration Decisions
- **Phase Strategy**: Sequential implementation (safer, easier to manage)
- **MVP**: Phase 1 = Coverage + Security + Performance
- **Backward Compatibility**: Don't maintain old format, learn from existing publishing mechanism only
- **CI/CD Performance**: Try full implementation first, split into fast/slow reports if needed
- **Branch Strategy**: Run on main branch only
- **API Test Performance**: Modify existing tests to include timing (Phase 1)
- **Visual Regression**: Included in Phase 4, all 14 HTML frontend pages
- **Load Testing**: Not included
- **Custom Metrics**: Not included
- **Report API**: Publish JSON data files (internal tool formats) to GitHub Pages alongside HTML reports

### Test Ownership Recommendation
**Primary Owner**: The person or team responsible for maintaining CI/CD infrastructure should own the build report system.

**Responsibilities**:
- Maintain and update analysis tools
- Update dependencies when needed
- Add new analysis types as requirements evolve
- Document procedures for adding new tools
- Review and respond to build report issues

**Documentation Required**:
- Setup guide for adding new analysis tools
- Troubleshooting guide for common issues
- Architecture documentation explaining report generation flow
- JSON schema documentation for published data

## Final Implementation Questions

The following clarifications are needed before starting implementation:

### 1. Subdirectory Structure Clarification
**Question**: How exactly should the subdirectory structure be organized?

**Option A - Report Type Subdirectories**:
```
/ (root of gh-pages)
├── index.html (main TOC)
├── coverage/
│   ├── index.html (coverage report)
│   └── data.json (c8 output)
├── security/
│   ├── index.html (security report)
│   └── data.json (npm audit output)
├── performance/
│   ├── index.html (performance report)
│   └── data.json (timing data)
└── ... (other report directories)
```

**Option B - Build-Specific Subdirectories**:
```
/ (root of gh-pages)
├── latest/ (symlink or copy to most recent build)
│   ├── index.html
│   ├── coverage.html
│   ├── security.html
│   ├── coverage.json
│   └── security.json
└── builds/
    ├── abc123/ (commit SHA)
    │   ├── index.html
    │   ├── coverage.html
    │   └── coverage.json
    └── def456/ (another commit SHA)
        └── ...
```

**Option C - Hybrid**:
```
/ (root of gh-pages)
├── latest/
│   ├── index.html (main TOC)
│   ├── coverage/
│   │   ├── index.html
│   │   └── data.json
│   ├── security/
│   │   ├── index.html
│   │   └── data.json
│   └── ...
└── builds/
    └── [sha]/
        └── (same structure as latest/)
```

Which structure do you prefer?

## Success Criteria

The enhanced build report will be considered successful when:

1. **Coverage**: Every source file has coverage metrics displayed with direct links to GitHub
2. **Security**: All dependency vulnerabilities and SAST findings reported with source links
3. **Complexity**: High-complexity functions identified with refactoring recommendations
4. **Linting**: Comprehensive lint results with categorized issues and source links
5. **Structure**: Dependency graph visualized with circular dependencies flagged
6. **Performance**: API response times tracked with slow endpoints highlighted
7. **Documentation**: JSDoc coverage calculated with undocumented functions listed
8. **History**: Trends displayed showing improvement/regression over time
9. **Links**: All artifacts link directly to relevant source files on GitHub
10. **Tests**: All 60 test cases pass demonstrating complete functionality

## Next Steps

1. ✅ ~~Answer open questions to resolve ambiguities~~ (COMPLETE)
2. ✅ ~~Select specific tools for each analysis type~~ (COMPLETE)
3. ✅ ~~Answer follow-up questions~~ (COMPLETE - 5 of 5 answered)
4. **Answer final implementation question** (1 remaining: subdirectory structure)
5. **Create detailed technical specifications for Phase 1 (MVP)**
6. **Begin Phase 1 implementation**:
   - Add c8 coverage collection
   - Configure ESLint with security plugins
   - Integrate npm audit
   - Modify API tests to include performance timing
   - Set up subdirectory structure
   - Generate report pages with source links
   - Publish JSON data files in internal tool formats

## Appendix A: Tool Candidates

### Coverage
- **c8**: ✅ **SELECTED** - Native V8 coverage, fast, Node.js 10.12+
- **NYC/Istanbul**: Alternative option (more mature but slower)

### Linting
- **ESLint**: Industry standard, highly configurable
- **Plugins**: security, no-unsanitized, promise, node, jsdoc

### Complexity
- **eslint-plugin-complexity**: ✅ **SELECTED** - Built into ESLint, integrates with existing linting
- **complexity-report**: Alternative for detailed Halstead metrics
- **jscomplexity**: Alternative for simple analysis

### Security
- **npm audit**: Built-in dependency scanning
- **Snyk**: More comprehensive, free tier available
- **eslint-plugin-security**: SAST via linting
- **detect-secrets**: Pattern-based secret detection

### Structural Analysis
- **Madge**: ✅ **SELECTED** - Dependency graph generator, circular dependency detection
- **D3.js**: ✅ **SELECTED** - For visualizing dependency graphs (or similar library)
- **dependency-cruiser**: Alternative option with more validation features

### Documentation
- **JSDoc**: Documentation generation and validation
- **documentation.js**: Alternative JSDoc tool with better output

### Performance
- **Custom scripts**: ✅ **SELECTED** - Modify existing API tests to include timing
- **autocannon**: Not included (load testing out of scope)

### Visual Regression
- **Puppeteer**: ✅ **CANDIDATE** - Headless browser for screenshots
- **Playwright**: Alternative option with better multi-browser support
- **pixelmatch**: For image comparison and diff generation

## Appendix B: Example Report Structure

### Main Report (index.html) - Table of Contents
```
Build Report - [Commit SHA] - [Timestamp]
├── Summary Dashboard
│   ├── Overall Status (Pass/Fail)
│   ├── Key Metrics (Coverage %, Security Issues, Build Duration)
│   └── Commit Info (SHA, Author, Message, Diff Link)
└── Reports (Links to separate pages)
    ├── → Test Results (test-results.html)
    ├── → Code Coverage (coverage.html) [+ JSON]
    ├── → Security Analysis (security.html) [+ JSON]
    ├── → Code Quality & Linting (quality.html) [+ JSON]
    ├── → Complexity Analysis (complexity.html) [+ JSON]
    ├── → Structural Analysis (structure.html) [+ JSON]
    ├── → Performance Metrics (performance.html) [+ JSON]
    ├── → Documentation Coverage (documentation.html) [+ JSON]
    ├── → Visual Regression (visual-regression.html) [+ JSON]
    └── → Historical Trends (trends.html) [+ JSON]
```

### Individual Report Pages
Each report page contains:
- Header with build metadata and link back to main TOC
- Report-specific metrics and visualizations
- Links to relevant source files on GitHub with line numbers
- Download link for corresponding JSON data file

### Published JSON Files
Available for programmatic access (internal tool formats):
- `coverage.json` - c8 coverage output format
- `security.json` - npm audit JSON output format
- `quality.json` - ESLint JSON output format
- `complexity.json` - eslint-plugin-complexity output
- `structure.json` - Madge JSON output format
- `performance.json` - Custom timing data structure
- `documentation.json` - JSDoc analysis output
- `visual-regression.json` - Visual diff data with image references
- `trends.json` - Historical data aggregation
- `metadata.json` - Build information and overall summary

**Format Note**: All JSON files use the internal output format of their respective tools (e.g., c8's native format, npm audit's native format) rather than a custom standardized format. This allows consumers to use existing parsers and tooling.

All HTML section headers and individual items link to relevant source files on GitHub with line numbers where applicable.
