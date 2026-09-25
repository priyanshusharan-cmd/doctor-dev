import type { RepositoryProfile, ConfigHealth, ConfigIssue, EnvVarInfo, PortMention } from '../types';
export declare function analyzeEnvVars(repoPath: string, sourceFiles: string[]): Promise<{
    envVars: EnvVarInfo[];
    issues: ConfigIssue[];
}>;
export declare function analyzePortsAndDocker(repoPath: string, profile: RepositoryProfile): Promise<{
    portMentions: PortMention[];
    issues: ConfigIssue[];
    dockerfiles: string[];
}>;
export declare function analyzeCi(repoPath: string, profile: RepositoryProfile): Promise<{
    issues: ConfigIssue[];
    ciFiles: string[];
}>;
export declare function analyzeDocumentation(repoPath: string, profile: RepositoryProfile): ConfigIssue[];
export declare function analyzeRuntime(repoPath: string, profile: RepositoryProfile): ConfigIssue[];
export declare function runConfigDoctor(repoPath: string, profile: RepositoryProfile): Promise<ConfigHealth>;
