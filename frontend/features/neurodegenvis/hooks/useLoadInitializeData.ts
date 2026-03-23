// src/hooks/useChat.ts
import { useState, useRef, useEffect } from "react";
import { initialSystemPrompts } from "../utils_chat/system_prompts";
import { MessageHistory } from "../utils_chat/types";
import { Patient } from "../data/Patient";
import { pca_num_features_list, cov_features_init } from "../data/variables_feature_lists";
import { clusterPatients, computePca, getCorrelationMatrix, loadDataset } from "../services/analysisService";

export function useLoadInitializeData(
  DEBUG: boolean,
  DATASET_PATH: string,
  setMessageHistoFun: (messages: MessageHistory[]) => void,
  setChatPearsonCorr: (messages: MessageHistory[]) => void,
  runInitialChatPrompt: (messageHistoInit: MessageHistory[]) => void,
) {
  // todo, hard coded 54
  let emptyPatient: Patient = new Patient();
  const [patients_data, setPatientData] = useState<Patient[]>(Array(54).fill(emptyPatient));
  // const [patients_data, setPatientData] = useState<Patient[]>([]);

  function setPatientDataFunc(data: Patient[]) {
    console.log("Setting data...");
    setPatientData(data);
  }

  const [pcaLoadings, setPcaLoadings] = useState<number[][]>([]);
  const [pearsonCorr, setPearsonCorr] = useState<any[]>([]);

  const [dataLoaded, setDataLoaded] = useState<boolean>(false);

  // kmeans
  const k_init = 2;
  const [k, setK] = useState<number>(k_init);

  // ------------------------- Data loading and processing (hook) -------------------------
  useEffect(() => {
    console.log("Loading data...");
    async function loadAndProcessData() {
      try {
        // Step 1: Load Data
        console.log("Loading dataset from:", DATASET_PATH);
        const datasetExists = await fetch(DATASET_PATH).then((res) => res.ok);
        console.log("Dataset exists:", datasetExists);

        const patientDataLoaded = await loadDataset(DATASET_PATH);
        console.log("Data loaded!", patientDataLoaded);

        // Step 2: Run PCA Analysis
        const newPcaLoadings = computePca(patientDataLoaded, pca_num_features_list);

        // Run Kmeans
        const clusteredPatients = clusterPatients(patientDataLoaded, k);

        // Step 3: Update State
        setPatientData(clusteredPatients);
        setPcaLoadings(newPcaLoadings);
        setDataLoaded(true); // Set this last to indicate both processes are done

        const correlations = getCorrelationMatrix(cov_features_init, clusteredPatients);
        setPearsonCorr(correlations);

        const chatPearsonCorrTemp: MessageHistory[] = [
          {
            role: "system",
            content:
              "Pearson correlations from some features in format {a: 'feature1', b: 'feature2', correlation: 'number'}" +
              JSON.stringify(correlations),
          },
        ];
        const messageHistoInit: MessageHistory[] = [...initialSystemPrompts, ...chatPearsonCorrTemp];

        setMessageHistoFun(messageHistoInit);
        setChatPearsonCorr(chatPearsonCorrTemp);

        if (!DEBUG) {
          runInitialChatPrompt(messageHistoInit);
        }
      } catch (error) {
        console.error("Error loading data or running PCA:", error);
      }
    }
    loadAndProcessData();
  }, []);

  return {
    patients_data,
    setPatientDataFunc,
    pcaLoadings,
    pearsonCorr,
    setPearsonCorr,
    // chatPearsonCorr,
    // initialChatHistory,
    dataLoaded,
    k,
    setK,
  };
}
