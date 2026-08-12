import type { Elysia } from "elysia";
import { JobController } from "../controllers/job.controller";
import { DepartmentRepository } from "../repositories/department.repository";
import { EmploymentTypeRepository } from "../repositories/employment-type.repository";
import { JobRepository } from "../repositories/job.repository";
import { JobService } from "../services/job.service";

const repo = new JobRepository();
const departmentRepo = new DepartmentRepository();
const employmentTypeRepo = new EmploymentTypeRepository();
const service = new JobService(repo, departmentRepo, employmentTypeRepo);

export const JobRoute = (app: Elysia) => app.use(JobController(service));
