export interface TestResult {
    test_id: string;
    type: string;
    passed: boolean;
    message: string;
}
export declare function runApiTest(skillId: string, endpointId: string, baseURL?: string): Promise<TestResult[]>;
//# sourceMappingURL=test.d.ts.map