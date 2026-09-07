import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import torch

from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    cohen_kappa_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


def get_performances(
    loader2eval,
    Model,
    device="cpu",
    nb_classes=2,
    return_scores=True,
    verbose=False,
    plot_confusion=False,
    class_labels=None,
):
    """
    ``get_performances`` calculates numerous metrics to evaluate a Pytorch's
    model. If specified, it also display a summary and plot two confusion matrices.

    Parameters
    ----------
    loader2eval: torch.utils.data.Dataloader
        A Pytorch's Dataloader with the samples to use for the evaluation.
    Model: torch.nn.Module
        A Pytorch's model to evaluate.
    device: torch.device, optional
        The device to use during batch forward.
        Default = 'cpu'
    nb_classes: int, optional
        The number of classes. Some operations are different between the binary
        and multiclass case.
        Default = 2
    return_scores: dict, optional
        Whether to return all the calculated metrics, predictions, and confusion
        matrices inside a dictionary.
        Default = True
    verbose: bool, optional
        Whether to print all the calculated metrics or not. A scikit-learn's
        classification report is also displayed.
        Default = False
    plot_confusion: bool, optional
        Whether to plot a confusion matrix or not.
        Default = False
    class_labels: list, optional
        A list with the labels to use for the confusion matrix plot. If None,
        values between 0 and the number of classes - 1 will be used.
        Default = None

    Returns
    -------
    scores: dict, optional
        A dictionary with a set of metrics, predictions, and confusion
        matrices calculated inside this function. The full list of values is:

            - 'logits': model's activations (logit output) as a numpy array.
            - 'probabilities': model's predicted probabilities as a numpy array.
            - 'predictions': model's predicted classes as a numpy array.
            - 'labels': true labels as a numpy array,
            - 'confusion': confusion matrix with absolute values as a
              Pandas DataFrame.
            - 'confusion_normalized': normalized confusion matrix with
              absolute values as a Pandas DataFrame.
            - 'accuracy_unbalanced': unbalanced accuracy,
            - 'accuracy_weighted': weighted accuracy,
            - 'precision_micro': micro precision,
            - 'precision_macro': macro precision,
            - 'precision_weighted': weighted precision,
            - 'precision_matrix': matrix with single class precisions,
            - 'recall_micro': micro recall,
            - 'recall_macro': macro recall,
            - 'recall_weighted': weighted recall,
            - 'recall_matrix': matrix with single calss recalls,
            - 'f1score_micro': micro f1-score,
            - 'f1score_macro': macro f1-score,
            - 'f1score_weighted': weighted f1-score,
            - 'f1score_matrix': matrix with single class f1-scores,
            - 'rocauc_micro': micro ROC AUC,
            - 'rocauc_macro': macro ROC AUC,
            - 'rocauc_weighted': weighted ROC AUC,
            - 'cohen_kappa': Cohen's Kappa score


    """
    # calculate logits, probabilities, and classes
    Model.to(device=device)
    Model.eval()
    ytrue = torch.zeros(len(loader2eval.dataset))
    ypred = torch.zeros_like(ytrue)
    if nb_classes <= 2:
        logit = torch.zeros(len(loader2eval.dataset))
    else:
        logit = torch.zeros(len(loader2eval.dataset), nb_classes)
    proba = torch.zeros_like(logit)
    cnt = 0
    for i, (X, Y) in enumerate(loader2eval):
        if isinstance(X, torch.Tensor):
            if X.device.type != device.type:
                X = X.to(device=device)
            Xshape = X.shape[0]
        else:
            for i in range(len(X)):
                if X[i].device.type != device.type:
                    X[i] = X[i].to(device=device)
            Xshape = X[0].shape[0]

        if isinstance(Y, torch.Tensor):
            ytrue[cnt : cnt + Xshape] = Y
        else:
            ytrue[cnt : cnt + Xshape] = Y[0]
        with torch.no_grad():
            yhat = Model(X)
            if isinstance(yhat, torch.Tensor):
                yhat = yhat.to(device="cpu")
            else:
                yhat = yhat[0].to(device="cpu")

            if nb_classes == 2:
                logit[cnt : cnt + Xshape] = torch.squeeze(yhat)
                yhat = torch.sigmoid(yhat)
                yhat = torch.squeeze(yhat)
                proba[cnt : cnt + Xshape] = yhat
                ypred[cnt : cnt + Xshape] = yhat > 0.5
            else:
                logit[cnt : cnt + Xshape] = yhat
                yhat = torch.softmax(yhat, 1)
                proba[cnt : cnt + Xshape] = yhat
                yhat = torch.argmax(yhat, 1)
                ypred[cnt : cnt + Xshape] = torch.squeeze(yhat)
        cnt += Xshape

    # convert to numpy for score computation
    proba = proba.numpy()
    logit = logit.numpy()
    ytrue = ytrue.numpy()
    ypred = ypred.numpy()

    # confusion matrices
    labels1 = [i for i in range(nb_classes)]
    if (class_labels is not None) and (len(class_labels) == nb_classes):
        index1 = class_labels
    else:
        index1 = [str(i) for i in range(nb_classes)]
    ConfMat = confusion_matrix(ytrue, ypred, labels=labels1).T
    ConfMat_df = pd.DataFrame(ConfMat, index=index1, columns=index1)
    Acc_mat = confusion_matrix(ytrue, ypred, labels=labels1, normalize="true").T
    Acc_mat_df = pd.DataFrame(Acc_mat, index=index1, columns=index1)

    # accuracy, precision, recall, f1, roc_auc, cohen's kappa
    acc_unbal = accuracy_score(ytrue, ypred)
    acc_weigh = balanced_accuracy_score(ytrue, ypred)

    f1_mat = f1_score(ytrue, ypred, average=None, zero_division=0.0)
    f1_micro = f1_score(ytrue, ypred, average="micro", zero_division=0.0)
    f1_macro = f1_score(ytrue, ypred, average="macro", zero_division=0.0)
    f1_weigh = f1_score(ytrue, ypred, average="weighted", zero_division=0.0)

    prec_mat = precision_score(ytrue, ypred, average=None, zero_division=0.0)
    prec_micro = precision_score(ytrue, ypred, average="micro", zero_division=0.0)
    prec_macro = precision_score(ytrue, ypred, average="macro", zero_division=0.0)
    prec_weigh = precision_score(ytrue, ypred, average="weighted", zero_division=0.0)

    recall_mat = recall_score(ytrue, ypred, average=None, zero_division=0.0)
    recall_micro = recall_score(ytrue, ypred, average="micro", zero_division=0.0)
    recall_macro = recall_score(ytrue, ypred, average="macro", zero_division=0.0)
    recall_weigh = recall_score(ytrue, ypred, average="weighted", zero_division=0.0)

    cohen_kappa = cohen_kappa_score(ytrue, ypred)

    if nb_classes == 2:
        roc_micro = roc_auc_score(ytrue, proba, average="micro", multi_class="ovo")
    else:
        roc_micro = np.nan
    roc_macro = roc_auc_score(ytrue, proba, average="macro", multi_class="ovr")
    roc_weigh = roc_auc_score(ytrue, proba, average="weighted", multi_class="ovr")

    # print everything plus a classification report if asked
    if verbose:
        print("           |-----------------------------------------|")
        print("           |                SCORE SUMMARY            |")
        print("           |-----------------------------------------|")
        print("           |  Accuracy score:                 %.3f  |" % acc_unbal)
        print("           |  Accuracy score weighted:        %.3f  |" % acc_weigh)
        print("           |-----------------------------------------|")
        print("           |  Precision score micro:          %.3f  |" % prec_micro)
        print("           |  Precision score macro:          %.3f  |" % prec_macro)
        print("           |  Precision score weighted:       %.3f  |" % prec_weigh)
        print("           |-----------------------------------------|")
        print("           |  Recall score micro:             %.3f  |" % recall_micro)
        print("           |  Recall score macro:             %.3f  |" % recall_macro)
        print("           |  Recall score weighted:          %.3f  |" % recall_weigh)
        print("           |-----------------------------------------|")
        print("           |  F1-score micro:                 %.3f  |" % f1_micro)
        print("           |  F1-score macro:                 %.3f  |" % f1_macro)
        print("           |  F1-score weighted:              %.3f  |" % f1_weigh)
        print("           |-----------------------------------------|")
        if nb_classes == 2:
            print("           |  ROC AUC micro:                  %.3f  |" % roc_micro)
        else:
            print("           |  ROC AUC micro:                  %.3f    |" % roc_micro)
        print("           |  ROC AUC macro:                  %.3f  |" % roc_macro)
        print("           |  ROC AUC weighted:               %.3f  |" % roc_weigh)
        print("           |-----------------------------------------|")
        print("           |  Cohen's kappa score:            %.3f  |" % cohen_kappa)
        print("           |-----------------------------------------|")

        print(" ")
        print(classification_report(ytrue, ypred, zero_division=0))
        print(" ")

    # plot a confusion matrix if asked
    if plot_confusion:
        const_size = 30
        vmin = np.min(ConfMat)
        vmax = np.max(ConfMat)
        off_diag_mask = np.eye(*ConfMat.shape, dtype=bool)

        plt.figure(figsize=(14, 6), layout="constrained")
        sns.set(font_scale=1.5)
        plt.subplot(1, 2, 1)
        sns.heatmap(
            ConfMat_df,
            vmin=0,
            vmax=vmax,
            mask=~off_diag_mask,
            fmt="4d",
            annot=True,
            cmap="Blues",
            linewidths=1,
            cbar_kws={"pad": 0.01},
            annot_kws={"size": const_size / np.sqrt(len(ConfMat_df))},
        )
        sns.heatmap(
            ConfMat_df,
            annot=True,
            mask=off_diag_mask,
            cmap="OrRd",
            vmin=vmin,
            vmax=vmax,
            linewidths=1,
            fmt="4d",
            cbar_kws={"ticks": [], "pad": 0.05},
            annot_kws={"size": const_size / np.sqrt(len(ConfMat_df))},
        )
        plt.xlabel("true labels", fontsize=20)
        plt.ylabel("predicted labels", fontsize=20)
        plt.title("Confusion Matrix", fontsize=25)

        sns.set(font_scale=1.5)
        plt.subplot(1, 2, 2)
        sns.heatmap(
            Acc_mat_df,
            vmin=-0.01,
            vmax=1.01,
            mask=~off_diag_mask,
            fmt=".3f",
            cbar_kws={"pad": 0.01},
            annot=True,
            cmap="Blues",
            linewidths=1,
        )
        sns.heatmap(
            Acc_mat_df,
            annot=True,
            mask=off_diag_mask,
            cmap="OrRd",
            fmt=".3f",
            cbar_kws={"ticks": [], "pad": 0.05},
            vmin=-0.01,
            vmax=1.01,
            linewidths=1,
        )
        plt.xlabel("true labels", fontsize=20)
        plt.ylabel("predicted labels", fontsize=20)
        plt.title("Normalized Confusion Matrix", fontsize=25)
        plt.show()

    if return_scores:
        scores = {
            "logits": logit,
            "probabilities": proba,
            "predictions": ypred,
            "labels": ytrue,
            "confusion": ConfMat_df,
            "confusion_normalized": Acc_mat_df,
            "accuracy_unbalanced": acc_unbal,
            "accuracy_weighted": acc_weigh,
            "precision_micro": prec_micro,
            "precision_macro": prec_macro,
            "precision_weighted": prec_weigh,
            "precision_matrix": prec_mat,
            "recall_micro": recall_micro,
            "recall_macro": recall_macro,
            "recall_weighted": recall_weigh,
            "recall_matrix": recall_mat,
            "f1score_micro": f1_micro,
            "f1score_macro": f1_macro,
            "f1score_weighted": f1_weigh,
            "f1score_matrix": f1_mat,
            "rocauc_micro": roc_micro,
            "rocauc_macro": roc_macro,
            "rocauc_weighted": roc_weigh,
            "cohen_kappa": cohen_kappa,
        }
        return scores
    else:
        return
